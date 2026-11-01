/**
 * detect.js 的离线自测：node test-detect.mjs
 * 不依赖 dsh 运行时，纯字符串输入。
 */

import fs from 'node:fs';
import { createAnalyzer } from './detect.js';

let failures = 0;

function feed(delta, config, analyzer = createAnalyzer()) {
  return analyzer.push(delta, config);
}

function expectHit(name, text, config, expected = true) {
  const hit = feed(text, config);
  const ok = (hit !== null) === expected;
  if (!ok) {
    failures += 1;
    console.log(`FAIL  ${name}  ->  ${JSON.stringify(hit)}  (expected hit=${expected})`);
  } else {
    console.log(`ok    ${name}  ${hit === null ? '无命中' : `命中 ${JSON.stringify(hit)}`}`);
  }
}

const strict = { threshold: 3, inlineRepeat: false };
const inline = { threshold: 3, inlineRepeat: true };
const loose = { threshold: 5, inlineRepeat: false };

// —— 短行门槛：只有"健康上下文"里才加宽；整段碎片化时恢复基础门槛 ——

/** 把短句和实质内容交替排列，保持非碎片化上下文。 */
function mixed(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push('执行。');
    out.push(`第 ${i} 步：读取配置文件并核对字段 ${i}，确认与文档描述一致。`);
  }
  return out.join('\n') + '\n';
}

// 1. 纯短行上下文 = 碎片化 → 短行恢复基础门槛
expectHit('纯短行 好。 ×3（碎片化，门槛 3）', '好。\n'.repeat(3), strict, true);
expectHit('纯短行 好。 ×5（碎片化，门槛 3）', '好。\n'.repeat(5), strict, true);

// 2. 交替碎片复读 = 碎片化
expectHit('交替 做。 ×3（碎片化，门槛 3）', '好。\n做。\n开始。\n做。\n嗯。\n做。\n', strict, true);

// 3. 长行不受短行门槛影响：出现 3 次就拦
expectHit('长句 ×3（门槛 3）', '我需要先检查服务器状态。\n'.repeat(3), strict, true);
expectHit('长句 ×2（门槛 3，不够）', '我需要先检查服务器状态。\n'.repeat(2), strict, false);

// 4. 非碎片化的健康上下文里，短行要 7 次（门槛 5 + 2）
expectHit('非碎片化 执行。 ×5（门槛 5，需 7）', mixed(5), loose, false);
expectHit('非碎片化 执行。 ×7（门槛 5，需 7）', mixed(7), loose, true);
expectHit('长句 ×5（门槛 5）', '我需要先检查服务器状态。\n'.repeat(5), loose, true);

// —— 行内重复开关 ——

// 5. 行内重复：关闭时不拦，开启时拦（行内判定不套短行门槛）
expectHit('行内重复关闭时不拦', '好。好。好。\n', strict, false);
expectHit('行内重复开启时拦', '好。好。好。\n', inline);
expectHit('长短语行内重复', '让我先看看。让我先看看。让我先看看。\n', inline);

// —— 排除项 ——

expectHit(
  '正常思考不误伤',
  '我先读一下配置文件，确认入口。\n然后检查构建脚本。\n最后跑一遍测试。\n',
  strict,
  false,
);
expectHit('代码围栏内重复不拦', '```\nfoo\nfoo\nfoo\nfoo\nfoo\n```\n', loose, false);
expectHit('数字列表不拦', '1.\n2.\n3.\n4.\n5.\n', loose, false);
expectHit('分隔线不拦', '---\n---\n---\n---\n---\n', loose, false);
expectHit('纯符号行不拦', '×\n×\n×\n×\n×\n', loose, false);

// —— 阈值 2 ——

expectHit(
  '阈值 2 长句 ×2',
  '这是一句足够长的话。\n这是一句足够长的话。\n',
  { threshold: 2, inlineRepeat: false },
  true,
);

// —— 真实样本：0.1.2 的误伤（非碎片化上下文） ——

{
  const fixture = fs.readFileSync(new URL('./test-fixtures/operation-log.txt', import.meta.url), 'utf8');
  const executed = fixture
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l === '执行。').length;
  expectHit(`真实操作日志（${executed} 个「执行。」）不命中`, fixture, loose, false);
}

// —— 碎片化上下文：整段都在短句之间打转 ——

{
  const cycle = ['执行。', '写文件。', '执行。', '好。', '执行。', '写。', '执行。', '完成。', '写。', '执行。', '写文件。', '执行。', '好。', '执行。'];
  const thunder = [];
  for (let i = 0; i < 8; i += 1) thunder.push(...cycle);
  expectHit('碎片化：雷霆复读命中（门槛 5，短行恢复为 5 次）', thunder.join('\n') + '\n', loose, true);

  // 同样的短句，但夹在实质内容里 → 非碎片化 → 仍按宽松门槛，不命中
  const healthy = [];
  for (let i = 0; i < 5; i += 1) {
    healthy.push('执行。');
    healthy.push(`第 ${i} 步：读取配置文件并核对字段 ${i}，确认与文档描述一致。`);
  }
  expectHit('非碎片化：同样的短句不命中', healthy.join('\n') + '\n', loose, false);
}

// —— 流式输入 ——

{
  const text = '我需要先检查服务器状态。\n'.repeat(3);
  const analyzer = createAnalyzer();
  let hit = null;
  for (const ch of text) {
    hit = analyzer.push(ch, strict);
    if (hit !== null) break;
  }
  if (hit === null) {
    failures += 1;
    console.log('FAIL  逐字符流式喂入  -> 无命中');
  } else {
    console.log(`ok    逐字符流式喂入  命中 ${JSON.stringify(hit)}`);
  }
}

// —— 窗口外的旧重复不累计 ——

{
  const filler = (base) =>
    Array.from({ length: 9 }, (_, i) => `${base} 第 ${i} 步：读取文件 ${i} 并检查内容。`).join('\n') + '\n';
  const text = '好的开始。\n' + filler('甲') + '好的开始。\n' + filler('乙') + '好的开始。\n';
  expectHit('窗口外的重复不累计', text, strict, false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
