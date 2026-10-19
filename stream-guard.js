/**
 * `llm/stream` 监听器：包一层上游流，思考段一出现复读就补完流并提前结束。
 *
 * 只检测 `reasoning-delta`（思考段）；正文 `text-delta` 与工具调用原样透传。
 * 复读退化先出现在思考段，那时正文往往还没开始产出，等正文也碎掉再掐就白烧了一半。
 *
 * 与旧实现的区别：不再"命中了再往下探一格、看是不是还在思考"。那种探测会漏掉
 * "复读几句后直接转正文"的情形，而通用重复检测（同一行在窗口内出现 threshold 次）
 * 本身已经把误伤率压得很低，不需要再探。
 */

import { createAnalyzer } from './detect.js';

/** `llm/stream` 的监听器签名。 */
/**
 * @typedef {(
 *   options: import('@deepseek-ai/dsh-llm').GenerateOptions,
 *   next: () => AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>,
 * ) => AsyncIterable<import('@deepseek-ai/dsh-llm').StreamChunk>} StreamListener
 */

/**
 * 逐 chunk 检查思考段，命中复读时补完这段流。
 * @param {AsyncIterable<any>} downstream - 上游模型的流。
 * @param {string | undefined} sessionId - 当前会话 id；有值才登记待续跑标记。
 * @param {{ pending: Map<string, { count: number, line: string }> }} state - 跨监听保留的拦截状态。
 * @param {{ read: () => object, countHit: () => number }} runtime - 配置与计数。
 * @returns {AsyncGenerator<any>} 包装后的流。
 */
async function* guardStream(downstream, sessionId, state, runtime) {
  const analyzer = createAnalyzer();
  const iterator = downstream[Symbol.asyncIterator]();
  let accumulated = '';
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
        const config = runtime.read();
        const hit = analyzer.push(chunk.text, config);
        if (hit !== null) {
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
 * @param {{ pending: Map<string, { count: number, line: string }> }} state - 跨监听保留的拦截状态。
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
