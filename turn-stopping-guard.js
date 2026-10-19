/**
 * `agent/turn-stopping` 监听器：把上一步掐断欠下的续跑补上。
 *
 * 监听器的返回值不被使用（该事件是 serial 的副作用钩子），实现方式是调
 * `agent.steer(...)`，见 resume.js 的说明。
 */

import { reviveTurn } from './resume.js';

/**
 * 造一个 `agent/turn-stopping` 监听器。
 * @param {{ pending: Map<string, { count: number, line: string }> }} state - 跨监听保留的拦截状态。
 * @param {() => object} readConfig - 取当前配置。
 * @returns {(payload: { agent: any }) => void} 监听器；只在有待续跑标记时推一条输入。
 */
export function createTurnStoppingGuard(state, readConfig) {
  return (payload) => {
    reviveTurn(state, payload.agent, readConfig());
  };
}
