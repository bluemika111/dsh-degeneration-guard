/**
 * 续跑：截断之后让本轮不要就此关闭，而是自己再跑一步。
 *
 * 机制在 dsh 侧：`agent/turn-stopping` 是 serial 事件，在本轮边界提交之前被 await，
 * 之后收件箱会被重新读一次（dsh-agent-loop 的 turn 收尾）：
 *
 *     if (turnEnds && this.inbox.nextStep.length === 0) await dispatch.serial('agent/turn-stopping', ...)
 *     if (turnEnds && this.inbox.nextStep.length === 0) break;   // 重读，读到东西就不 break
 *
 * 所以在监听器里调 `agent.steer(...)` 推一条输入，本轮就会再跑一步，而不是停下等用户。
 *
 * 推什么内容由配置决定：`resumeText` 给模型，`resumeSummary` 给用户看（折叠行）。
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { fillTemplate } from './config.js';

/**
 * 本轮即将关闭时，若上一步刚被掐断过，就推一条输入让本轮继续。
 * @param {{ pending: Map<string, { count: number, line: string }> }} state - 跨监听保留的拦截状态。
 * @param {{ session: { id: string }, steer: (message: unknown) => void }} agent - 本轮所属的 agent 句柄。
 * @param {object} config - 当前配置。
 * @returns {void}
 */
export function reviveTurn(state, agent, config) {
  const sessionId = agent.session.id;
  const pending = state.pending.get(sessionId);
  if (pending === undefined) {
    return;
  }
  state.pending.delete(sessionId);
  if (!config.autoResume) {
    console.log(`[degeneration-guard] turn-stopping：会话 ${sessionId} 未开启自动续跑，交由用户继续`);
    return;
  }
  const text = fillTemplate(config.resumeText, pending);
  const summary = fillTemplate(config.resumeSummary, pending);
  try {
    agent.steer(
      createUserMessage({
        content: [{ type: 'text', text }],
        // `form: 'notice'` 要求同时给出 `summary`：客户端据此把它渲染成一条折叠的
        // context 行（这就是聊天里那条"已打断"提示），而不是用户气泡。
        source: {
          kind: 'plugin:degeneration-guard',
          form: 'notice',
          summary,
        },
      }),
    );
    console.log(`[degeneration-guard] turn-stopping：会话 ${sessionId} 自动续跑一步`);
  } catch (error) {
    console.log(`[degeneration-guard] 续跑注入失败：${String(error)}`);
  }
}
