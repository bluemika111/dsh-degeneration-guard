/**
 * 复读检测内核：通用重复检测，不依赖词表。
 *
 * 判据有两条，都只看"思考段"里已经产出的文本：
 *
 * 1. 行重复（始终启用）：最近一个滑动窗口里，同一整行出现了 threshold 次。
 *    窗口大小 = max(9, threshold * 3) 行。看窗口而不是"连续相等"，是因为真实复读
 *    很少严格连续——典型的碎片复读是「好。 / 做。 / 开始。 / 做。 / 嗯。 / 做。」，
 *    同一句被别的短句隔开。旧插件要求"连续命中"，混进一个表外词就清零，所以阈值设
 *    2 以上等于永久失效。
 *
 * 2. 行内重复（inlineRepeat 开启时才看）：单行内部由同一个单元重复而成，如
 *    「好。好。好。」。关闭时只认跨换行的重复，也就是只检测独立段落。
 *
 * 明确不参与判定的行：空行、代码围栏（``` / ~~~）内的行、去掉数字与标点后为空的
 * 装饰行（"1." "---" "===" ），避免把列表和分隔线当成复读。
 */

/** 保留的行数上限；窗口最大 9 行，留够余量即可。 */
const MAX_LINES = 64;

/** 未完成行的行内检测上限；一行写到这么长就不可能是靠行内重复退化。 */
const PENDING_CHECK_LIMIT = 512;

/** 行内重复检测的单元长度上限。 */
const INLINE_UNIT_LIMIT = 96;

/** 未完成行做行内检测时允许的更小单元上限。 */
const PENDING_UNIT_LIMIT = 64;

/** 代码围栏起始行。 */
const FENCE = /^(```|~~~)/;

/**
 * 短行门槛：长度不超过这个值的行（"执行。" "好。" 这类命令动词、口头禅），
 * 需要比阈值多出现几次才算复读。
 *
 * 起因是真实数据：阈值 5 下命中的 20 次全部是「执行。」，而它们所在的消息是
 * 正常的分步调查推理，只是每推进一步就写一行「执行。」收尾。短行在长任务里
 * 天然高频，同一个门槛套在长短行上，误伤几乎必然。
 */
const SHORT_LINE_LIMIT = 4;

/** 短行需要的额外次数。 */
const SHORT_LINE_BONUS = 2;

/**
 * 这一行需要出现几次才判复读。
 * @param {string} line - 已 trim 的行。
 * @param {number} base - 配置的阈值。
 * @returns {number} 实际门槛。
 */
function needCount(line, base) {
  return line.length <= SHORT_LINE_LIMIT ? base + SHORT_LINE_BONUS : base;
}

/**
 * 这一行是不是纯装饰（只有数字、标点、符号、空白）。
 * @param {string} line - 已 trim 的行。
 * @returns {boolean} true 表示不参与判定。
 */
function isDecorative(line) {
  return /^[\s\d\p{P}\p{S}]+$/u.test(line);
}

/**
 * 一行是否由同一个单元重复若干次完整构成。
 * @param {string} line - 已 trim 的行。
 * @param {number} limit - 单元长度上限。
 * @returns {{ unit: string, count: number } | null} 最大重复次数，未重复时 null。
 */
function inlineRun(line, limit) {
  const n = line.length;
  if (n < 2) {
    return null;
  }
  const maxPeriod = Math.min(limit, Math.floor(n / 2));
  for (let period = 1; period <= maxPeriod; period += 1) {
    if (n % period !== 0) {
      continue;
    }
    const count = n / period;
    if (count < 2) {
      continue;
    }
    const unit = line.slice(0, period);
    if (unit.repeat(count) === line) {
      return { unit, count };
    }
  }
  return null;
}

/**
 * 造一个有状态的流式分析器。
 *
 * 只喂新增文本（delta），不重复扫描历史，所以每个 chunk 的开销与 delta 长度相当。
 * 配置每个 chunk 现取，改设置立即生效。
 *
 * @returns {{
 *   push: (delta: string, config: object) => ({ kind: 'line' | 'inline', line: string, count: number } | null),
 *   reset: () => void,
 * }} 分析器。
 */
export function createAnalyzer() {
  /** 当前尚未换行的一行残余。 */
  let pending = '';
  /** 已完成的、参与判定的行。 */
  const lines = [];
  /** 是否位于代码围栏内。 */
  let fence = false;

  /**
   * 收下一整行；命中时返回命中信息。
   * @param {string} raw - 未 trim 的整行。
   * @param {object} config - 当前配置。
   * @returns {object | null} 命中信息。
   */
  function acceptLine(raw, config) {
    const line = raw.trim();
    if (line === '') {
      return null;
    }
    if (FENCE.test(line)) {
      fence = !fence;
      return null;
    }
    if (fence || isDecorative(line)) {
      return null;
    }
    if (config.inlineRepeat) {
      const inline = inlineRun(line, INLINE_UNIT_LIMIT);
      if (inline !== null && inline.count >= config.threshold) {
        return { kind: 'inline', line: inline.unit, count: inline.count };
      }
    }
    lines.push(line);
    if (lines.length > MAX_LINES) {
      lines.shift();
    }
    return null;
  }

  /**
   * 在最近窗口里找出现次数达到阈值的整行。
   * @param {object} config - 当前配置。
   * @returns {object | null} 命中信息。
   */
  function windowHit(config) {
    const size = Math.max(9, config.threshold * 3);
    const from = Math.max(0, lines.length - size);
    const counts = new Map();
    for (let at = from; at < lines.length; at += 1) {
      const line = lines[at];
      const seen = (counts.get(line) ?? 0) + 1;
      if (seen >= needCount(line, config.threshold)) {
        return { kind: 'line', line, count: seen };
      }
      counts.set(line, seen);
    }
    return null;
  }

  return {
    /**
     * 喂一段新增的思考文本。
     * @param {string} delta - 新增文本。
     * @param {object} config - 当前配置。
     * @returns {object | null} 命中信息；null 表示还没退化。
     */
    push(delta, config) {
      pending += delta;
      let at = pending.indexOf('\n');
      while (at !== -1) {
        const hit = acceptLine(pending.slice(0, at), config);
        pending = pending.slice(at + 1);
        if (hit !== null) {
          return hit;
        }
        const windowed = windowHit(config);
        if (windowed !== null) {
          return windowed;
        }
        at = pending.indexOf('\n');
      }
      // 还没换行：句子里可能已经在原地打转（"好。好。好。"），边写边判。
      if (config.inlineRepeat && pending.length > 0 && pending.length <= PENDING_CHECK_LIMIT) {
        const inline = inlineRun(pending.trim(), PENDING_UNIT_LIMIT);
        if (inline !== null && inline.count >= config.threshold) {
          return { kind: 'inline', line: inline.unit, count: inline.count };
        }
      }
      return null;
    },

    /** 清空状态；新的一次生成从零开始。 */
    reset() {
      pending = '';
      lines.length = 0;
      fence = false;
    },
  };
}
