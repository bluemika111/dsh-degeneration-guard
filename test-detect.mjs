/**
 * detect.js 的离线自测：node test-detect.mjs
 * 不依赖 dsh 运行时，纯字符串输入。
 */

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

// 1. 连续整行复读
expectHit('连续 好。 x3', '好。\n好。\n好。\n', strict);

// 2. 交替碎片复读（旧插件抓不到的那种）
expectHit('交替 做。 x3', '好。\n做。\n开始。\n做。\n嗯。\n做。\n', strict);

// 3. 旧插件的误伤场景：阈值 2 时两个不同的确认语
expectHit('两个不同确认语不误伤', '好。\n好的。\n', { threshold: 2, inlineRepeat: false }, false);

// 4. 行内重复：关闭时不拦
expectHit('行内重复关闭时不拦', '好。好。好。\n', strict, false);

// 5. 行内重复：开启时拦
expectHit('行内重复开启时拦', '好。好。好。\n', inline);

// 6. 正常思考不误伤
expectHit(
  '正常思考不误伤',
  '我先读一下配置文件，确认入口。\n然后检查构建脚本。\n最后跑一遍测试。\n',
  strict,
  false,
);

// 7. 代码围栏里的重复不拦
expectHit('代码围栏内重复不拦', '```\nfoo\nfoo\nfoo\n```\n', strict, false);

// 8. 列表行不拦
expectHit('数字列表不拦', '1.\n2.\n3.\n4.\n', strict, false);

// 9. 长句重复
expectHit(
  '长句整行重复',
  '我需要先检查服务器状态。\n我需要先检查服务器状态。\n我需要先检查服务器状态。\n',
  strict,
);

// 10. 逐字符流式喂入
{
  const text = '好。\n好。\n好。\n';
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

// 11. 阈值 2 的两个相同行（应命中）
expectHit('阈值 2 两行相同', '好的。\n好的。\n', { threshold: 2, inlineRepeat: false });

// 12. 窗口外的旧重复不算（填充行彼此不同，隔开超过窗口大小）
{
  const config = { threshold: 3, inlineRepeat: false };
  const filler = (base) =>
    Array.from({ length: 9 }, (_, i) => `${base} 第 ${i} 步：读取文件 ${i} 并检查内容。`).join('\n') + '\n';
  const text = '好。\n' + filler('甲') + '好。\n' + filler('乙') + '好。\n';
  expectHit('窗口外的重复不累计', text, config, false);
}

// 13. 行内重复，单元为较长短语
expectHit('长短语行内重复', '让我先看看。让我先看看。让我先看看。\n', inline);

// 14. 纯符号行不拦
expectHit('分隔线不拦', '---\n---\n---\n', strict, false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
