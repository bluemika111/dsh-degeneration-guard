/**
 * stream-guard.js 的集成自测：node test-stream.mjs
 * 用假流模拟上游，验证截断、计数与待续跑标记。
 */

import { createStreamGuard } from './stream-guard.js';

let failures = 0;

function chunk(text) {
  return { type: 'reasoning-delta', index: 0, text };
}

async function* upstream(parts) {
  yield { type: 'block-start', index: 0, blockType: 'reasoning' };
  for (const part of parts) {
    yield chunk(part);
  }
  yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: '' } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}

async function collect(iterable) {
  const out = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
}

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

// 1. 命中：应补 block-end + finish 并登记续跑
{
  let count = 0;
  const state = { pending: new Map() };
  const runtime = {
    read: () => ({
      threshold: 3,
      inlineRepeat: false,
      autoResume: true,
      resumeText: 'STOP {count} {line}',
      resumeSummary: 'S {count}',
    }),
    countHit: () => {
      count += 1;
      return count;
    },
  };
  const guard = createStreamGuard(state, runtime);
  const out = await collect(
    guard({ sessionId: 's1' }, () => upstream(['好。\n', '好。\n', '好。\n', '还会继续\n', '还会继续\n'])),
  );
  const end = out.slice(-2);
  check('命中后补 block-end', end[0]?.type === 'block-end' && end[0]?.block?.type === 'reasoning');
  check('命中后补 finish(stop)', end[1]?.type === 'finish' && end[1]?.reason?.kind === 'stop');
  check('命中后不再透传后续 chunk', out.filter((c) => c.type === 'reasoning-delta').length === 3);
  check('计数加一', count === 1);
  check('登记待续跑', state.pending.get('s1')?.count === 1, JSON.stringify(state.pending.get('s1')));
}

// 2. 未命中：原样透传到 finish
{
  let count = 0;
  const state = { pending: new Map() };
  const runtime = {
    read: () => ({
      threshold: 3,
      inlineRepeat: false,
      autoResume: true,
      resumeText: '',
      resumeSummary: '',
    }),
    countHit: () => {
      count += 1;
      return count;
    },
  };
  const guard = createStreamGuard(state, runtime);
  const out = await collect(
    guard({ sessionId: 's2' }, () => upstream(['先读配置。\n', '再跑测试。\n', '最后总结。\n'])),
  );
  check('未命中不截断', out.some((c) => c.type === 'finish') && out.length === 6);
  check('未命中不计数', count === 0);
  check('未命中不登记', state.pending.size === 0);
}

// 3. autoResume 关闭：拦截但不出待续跑标记
{
  let count = 0;
  const state = { pending: new Map() };
  const runtime = {
    read: () => ({
      threshold: 3,
      inlineRepeat: false,
      autoResume: false,
      resumeText: '',
      resumeSummary: '',
    }),
    countHit: () => {
      count += 1;
      return count;
    },
  };
  const guard = createStreamGuard(state, runtime);
  const out = await collect(guard({ sessionId: 's3' }, () => upstream(['好。\n', '好。\n', '好。\n', '继续\n'])));
  check('关闭自动续跑仍截断', out.at(-1)?.type === 'finish');
  check('关闭自动续跑不登记', state.pending.size === 0);
  check('关闭自动续跑仍计数', count === 1);
}

// 4. 辅助调用（purpose 有值）不检测
{
  let count = 0;
  const state = { pending: new Map() };
  const runtime = {
    read: () => ({ threshold: 3, inlineRepeat: false, autoResume: true, resumeText: '', resumeSummary: '' }),
    countHit: () => {
      count += 1;
      return count;
    },
  };
  const guard = createStreamGuard(state, runtime);
  const out = await collect(
    guard({ sessionId: 's4', purpose: 'session-title' }, () => upstream(['好。\n', '好。\n', '好。\n'])),
  );
  check('辅助调用直接透传', out.length === 6 && count === 0, `out=${out.length} count=${count}`);
}

// 5. 上一次拦截的欠账还没结算时，仍然拦截（不能因为欠账而永久漏拦）
{
  let count = 0;
  const state = { pending: new Map([['s5', { count: 1, line: '好。' }]]) };
  const runtime = {
    read: () => ({ threshold: 3, inlineRepeat: false, autoResume: true, resumeText: '', resumeSummary: '' }),
    countHit: () => {
      count += 1;
      return count;
    },
  };
  const guard = createStreamGuard(state, runtime);
  const out = await collect(guard({ sessionId: 's5' }, () => upstream(['好。\n', '好。\n', '好。\n'])));
  check(
    '欠账未结算时仍拦截',
    count === 1 && out.at(-1)?.type === 'finish' && state.pending.get('s5')?.count === 1,
    `count=${count} pending=${JSON.stringify(state.pending.get('s5'))}`,
  );
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
