/**
 * `llm/stream` 监听器：包一层上游流，思考段一出现复读就补完流并提前结束。
 *
 * 只检测 `reasoning-delta`（思考段）；正文 `text-delta` 与工具调用原样透传。
 * 复读退化先出现在思考段，那时正文往往还没开始产出，等正文也碎掉再掐就白烧了一半。
 *
 * 命中之后还要过一道冷却闸：同一会话在一段时间内最多拦几次，超了就放行。理由是
 * 真实日志里出现过一段任务被连续打断十几次的情况——每次截断都会让模型重新组织
 * 同类步骤，于是同一形态稳定复现，一次误判被自动续跑放大成十次。
 */

import { createAnalyzer } from './detect.js';

/** 冷却窗口：同一会话在这个时间窗内最多拦几次。 */
const COOLDOWN_WINDOW_MS = 10 * 60 * 1000;

/** 窗口内允许的拦截次数。 */
const COOLDOWN_MAX = 2;

/** `llm/stream` 的监听器签名。 */
/**
 * @typedef {(
 *   options: import('@deepseek-ai/dsh-llm').GenerateOptions,
 *   next: () => AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>,
 * ) => AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>} StreamListener
 */

/**
 * 取一次拦截配额。
 *
 * 冷却窗口内配额用完时返回 `allowed: false`：这一次命中不截断、不计数，只记日志。
 * 宁可放过一次退化，也不要在一段正常任务里连续打断十几次。
 *
 * @param {{ pending: Map<string, { count: number, line: string }>, recent: Map<string, number[]> }} state - 拦截状态。
 * @param {string | undefined} sessionId - 会话 id。
 * @param {number} now - 当前时间戳。
 * @returns {{ allowed: boolean, used: number }} 是否允许，以及窗口内已用次数。
 */
function takeSlot(state, sessionId, now) {
  if (sessionId === undefined) {
    return { allowed: true, used: 0 };
  }
  if (!(state.recent instanceof Map)) {
    state.recent = new Map();
  }
  const list = (state.recent.get(sessionId) ?? []).filter((at) => now - at < COOLDOWN_WINDOW_MS);
  if (list.length >= COOLDOWN_MAX) {
    state.recent.set(sessionId, list);
    return { allowed: false, used: list.length };
  }
  list.push(now);
  state.recent.set(sessionId, list);
  return { allowed: true, used: list.length };
}

/**
 * 逐 chunk 检查思考段，命中复读时补完这段流。
 * @param {AsyncIterable<any>} downstream - 上游模型的流。
 * @param {string | undefined} sessionId - 当前会话 id；有值才登记待续跑标记。
 * @param {{ pending: Map<string, { count: number, line: string }>, recent: Map<string, number[]> }} state - 跨监听保留的拦截状态。
 * @param {{ read: () => object, countHit: () => number }} runtime - 配置与计数。
 * @returns {AsyncGenerator<any>} 包装后的流。
 */
async function* guardStream(downstream, sessionId, state, runtime) {
  const analyzer = createAnalyzer();
  const iterator = downstream[Symbol.asyncIterator]();
  let accumulated = '';
  /** 本段流是否已因冷却放弃拦截；放弃后不再检测，避免每个 chunk 都打日志。 */
  let suppressed = false;
  try {
    for (;;) {
      const step = await iterator.next();
      if (step.done) {
        return;
      }
      const chunk = step.value;
      if (chunk.type === 'reasoning-delta') {
        accumulated += chunk.text;
        // 同一段流命中后立刻 return，天然只会拦一次；这里不按"该会话已有欠账"来
        // 跳过检测，否则上一次拦截若因故没走到 turn-stopping，欠账会一直挂着，
        // 让这个会话之后再也拦不住。
        if (!suppressed) {
          const config = runtime.read();
          const hit = analyzer.push(chunk.text, config);
          if (hit !== null) {
            const slot = takeSlot(state, sessionId, Date.now());
            if (!slot.allowed) {
              suppressed = true;
              console.log(
                `[degeneration-guard] 冷却中，放行本次命中 | 会话=${sessionId ?? '无'} | 行=${JSON.stringify(hit.line)} | 次数=${hit.count} | 窗口内已拦=${slot.used}`,
              );
            } else {
              const count = runtime.countHit();
              if (config.autoResume && sessionId !== undefined) {
                state.pending.set(sessionId, { count, line: hit.line });
              }
              console.log(
                `[degeneration-guard] 检出复读，已截断本次生成 | 会话=${sessionId ?? '无'} | 方式=${hit.kind} | 行=${JSON.stringify(hit.line)} | 次数=${hit.count} | 累计=${count} | 自动续跑=${config.autoResume ? '是' : '否'}`,
              );
              // 触发点本身已经产生了，照常放行；要掐掉的是它之后的思考。
              yield chunk;
              yield { type: 'block-end', index: chunk.index, block: { type: 'reasoning', text: accumulated } };
              yield { type: 'finish', reason: { kind: 'stop' } };
              return;
            }
          }
        }
      }
      yield chunk;
    }
  } finally {
    // 提前 return 时必须显式向下游传播：不补这一步上游 HTTP 流会继续跑到结束，
    // 供应商照常计满 token，且连接悬挂。上游可能已经结束/关闭，其异常忽略。
    try {
      await iterator.return?.();
    } catch {
      /* 上游已经结束或关闭，无需处理 */
    }
  }
}

/**
 * 造一个 `llm/stream` 监听器。
 * @param {{ pending: Map<string, { count: number, line: string }>, recent: Map<string, number[]> }} state - 跨监听保留的拦截状态。
 * @param {{ read: () => object, countHit: () => number }} runtime - 配置与计数。
 * @returns {StreamListener} 监听器；辅助调用直接透传，其余包一层复读检测。
 */
export function createStreamGuard(state, runtime) {
  return (options, next) => {
    // 辅助调用（上下文压缩、会话标题）不参与检测。
    if (options.purpose !== undefined) {
      return next();
    }
    return guardStream(next(), options.sessionId, state, runtime);
  };
}
