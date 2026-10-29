// dsh-degeneration-guard — 宿主侧插件入口：拦截"复读"型推理退化。
//
// 做法：包一层 `llm/stream`（模型调用的流式 waterfall），逐 chunk 观察思考段
// （reasoning-delta）。检测器命中复读时，把触发命中的那个 delta 照常放行，补一个
// block-end 闭合思考块，再补一个 finish(stop)，然后结束流。对 agent-loop 而言这就是
// 一次正常完成；随后 `agent/turn-stopping` 里推一条输入，本轮自己继续。
//
// 判据是通用重复检测，不查词表：同一整行在最近窗口里出现 threshold 次就算复读，
// 可选再算上行内重复（"好。好。好。"）。见 detect.js。
//
// 本文件只做装配，具体逻辑在各自模块里。

import { Config, createRuntime } from './config.js';
import { createStreamGuard } from './stream-guard.js';
import { createTurnStoppingGuard } from './turn-stopping-guard.js';

// 插件模块的导出形态：loader 优先取 `default`，而 Config 必须挂在拿到的那个对象上。
// 所以不写 default 导出，而是导出 `Config` + `apply` 两个具名。
export { Config };

/**
 * 函数式插件入口；注册的监听随插件卸载自动释放。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主 cordis 上下文。
 * @param {import('@deepseek-ai/schemastery').Type<typeof Config>} config - 本插件配置。
 * @returns {void}
 */
export function apply(ctx, config) {
  // 直接写 stdout：dsh 把插件 stdout 收进 journal，便于确认插件确实被加载。
  console.log('[degeneration-guard] 已加载，复读拦截生效');

  const state = { pending: new Map(), recent: new Map() };
  const runtime = createRuntime(ctx, config);

  ctx.on('llm/stream', createStreamGuard(state, runtime), { global: true });
  ctx.on('agent/turn-stopping', createTurnStoppingGuard(state, runtime.read));
}
