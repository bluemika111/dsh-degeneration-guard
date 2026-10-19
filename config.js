/**
 * 插件配置：重复阈值、行内重复开关、自动续跑开关、拦截提示词、累计计数。
 *
 * dsh 0.1.7 起配置就是插件自己的 entry Config：标记 `.volatile()` 的字段由宿主的
 * 设置活页读写并写回 profile 的 cordis patch，宿主侧持有稳定引用、按需 `.get()`，
 * 所以改完立即生效，不必重启。
 *
 * 计数寄在同一份配置里：每次拦截写一次，客户端读同一个值弹提示，清零就是写成 0。
 * 与旧插件不同，这里**不在加载时归零**——拦截次数是持久统计，只有用户点清零才归零。
 */

import z from '@deepseek-ai/schemastery';

/** profile 里本插件的条目 id，必须与 cordis.patch.yml 的 `id` 逐字一致。 */
export const ENTRY_ID = 'dsh-degeneration-guard';

/** 默认阈值：同一行在窗口内出现 3 次才拦。 */
export const DEFAULT_THRESHOLD = 3;

/** 阈值下限：1 没有意义（至少两次才叫重复），2 起才允许。 */
export const THRESHOLD_MIN = 2;

/** 阈值上限。 */
export const THRESHOLD_MAX = 9;

/** 默认关闭行内重复检测：只认跨换行的重复，也就是只检测独立段落。 */
export const DEFAULT_INLINE_REPEAT = false;

/** 默认自动续跑：截断后由插件推一条输入，本轮自己继续，不需要用户手动点。 */
export const DEFAULT_AUTO_RESUME = true;

/**
 * 默认的拦截提示词（推给模型的那一段）。
 * 可用占位符：`{count}` 第几次拦截，`{line}` 触发拦截的那一行。
 */
export const DEFAULT_RESUME_TEXT = [
  '[拦截复读]',
  '你上一段思考已经出现推理退化，系统已截断。',
  '请直接继续执行下一步，不要再输出任何确认语、寒暄或空话。',
].join('\n');

/**
 * 默认的折叠行摘要（只给用户看，模型看不到）。
 * 同样支持 `{count}` 与 `{line}`。
 */
export const DEFAULT_RESUME_SUMMARY = '复读已打断（第 {count} 次）· 已自动继续';

/**
 * 标记一个字段可由设置页编辑。
 *
 * schemastery 3.18.4+ 才有 `.volatile()`：它既打 meta 标记，又把默认值物化成稳定引用。
 * 更早的版本（例如 profile 父层可能解析到的 3.18.2）没有这个方法，直接写 `meta.volatile`
 * 即可——宿主的 volatileForm / diff 读的就是 meta，表单照常投影。代价是旧版不物化引用，
 * 读取要按普通值处理（见 valueOf），变更按「重挂载生效」。
 * @param {any} field - schemastery 字段。
 * @returns {any} 同一个字段。
 */
function mark(field) {
  if (field === null || field === undefined) {
    return field;
  }
  if (typeof field.volatile === 'function') {
    return field.volatile();
  }
  field.meta = Object.assign({}, field.meta, { volatile: true });
  return field;
}

/**
 * 读一个配置字段：新版是带 `.get()` 的稳定引用，旧版是普通值。
 * @param {any} field - 配置字段。
 * @returns {any} 当前值。
 */
function valueOf(field) {
  return field !== null && typeof field === 'object' && typeof field.get === 'function'
    ? field.get()
    : field;
}

/**
 * 插件 Config schema。只有标了 volatile 的字段会进设置活页并支持编辑。
 */
export const Config = z.object({
  threshold: mark(z.number().default(DEFAULT_THRESHOLD)),
  inlineRepeat: mark(z.boolean().default(DEFAULT_INLINE_REPEAT)),
  autoResume: mark(z.boolean().default(DEFAULT_AUTO_RESUME)),
  resumeText: mark(z.string().default(DEFAULT_RESUME_TEXT)),
  resumeSummary: mark(z.string().default(DEFAULT_RESUME_SUMMARY)),
  count: mark(z.number().default(0)),
});

/**
 * 判定与续跑用得上的一份配置快照。
 * @typedef {{
 *   threshold: number,
 *   inlineRepeat: boolean,
 *   autoResume: boolean,
 *   resumeText: string,
 *   resumeSummary: string,
 * }} GuardConfig
 */

/**
 * 把 volatile 引用折叠成一份快照。
 * @param {import('@deepseek-ai/schemastery').Type<typeof Config>} config - loader 解析后的配置。
 * @returns {GuardConfig} 当前配置。
 */
function snapshot(config) {
  return {
    threshold: Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(valueOf(config.threshold)))),
    inlineRepeat: valueOf(config.inlineRepeat),
    autoResume: valueOf(config.autoResume),
    resumeText: valueOf(config.resumeText),
    resumeSummary: valueOf(config.resumeSummary),
  };
}

/**
 * 造宿主侧运行时：取配置、记一次拦截。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 宿主上下文。
 * @param {import('@deepseek-ai/schemastery').Type<typeof Config>} config - loader 解析后的配置。
 * @returns {{
 *   read: () => GuardConfig,
 *   countHit: () => number,
 * }} 运行时句柄。
 */
export function createRuntime(ctx, config) {
  const read = () => snapshot(config);

  /** 本地计数；settings 每次落盘后与配置同步，避免连续拦截时读到旧值。 */
  let total = Number(valueOf(config.count)) || 0;

  let write = null;
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings;
    // 本插件自带设置活页，关掉宿主按 schema 自动生成的那一页。
    settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber));
    write = (count) => {
      // 现取 revision：表单刚写过的话，旧 revision 会被 SETTINGS_CONFLICT 拒掉。
      const revision = settings.describe().find((entry) => entry.ns === ENTRY_ID)?.revision;
      settings.update(ENTRY_ID, { count }, revision).catch((error) => {
        console.log(`[degeneration-guard] 写计数失败：${String(error)}`);
      });
    };
    // 用户在设置页清零、或别处改了这个值时，本地计数跟着回到真相。
    settingsCtx.on('settings/document-updated', (ns) => {
      if (ns === ENTRY_ID) {
        total = Number(valueOf(config.count)) || 0;
      }
    });
  });

  return {
    read,
    /**
     * 记一次拦截。
     * @returns {number} 新的累计次数。
     */
    countHit() {
      total = Math.max(total, Number(valueOf(config.count)) || 0) + 1;
      write?.(total);
      return total;
    },
  };
}

/**
 * 把占位符替换成实际值。
 * @param {string} template - 含 `{count}` / `{line}` 的模板。
 * @param {{ count: number, line: string }} values - 实际值。
 * @returns {string} 替换后的文本。
 */
export function fillTemplate(template, values) {
  return template
    .replace(/\{count\}/g, String(values.count))
    .replace(/\{line\}/g, values.line);
}
