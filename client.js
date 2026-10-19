window.__ModuleLoader__.load({
  id: 'dsh-degeneration-guard',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** profile 条目 id，必须与宿主侧 config.js 的 ENTRY_ID 逐字一致。 */
    const ENTRY_ID = 'dsh-degeneration-guard';
    const THRESHOLD_MIN = 2;
    const THRESHOLD_MAX = 9;

    /** 输入框与文本域的公共外观。 */
    const FIELD =
      'height:36px;box-sizing:border-box;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px';

    /** 样式。令牌名取自 dsh 前端的设计令牌表。 */
    const CSS = `
.dg-root{display:flex;flex-direction:column;width:100%}
.dg-head{display:flex;align-items:center;gap:12px;padding:2px 0 14px}
.dg-headTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px}
.dg-headNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap}
.dg-save{cursor:pointer;flex:none;height:32px;padding:0 16px;border:none;border-radius:16px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-family:inherit;font-size:14px;line-height:22px}
.dg-save:hover{background:var(--dsw-alias-button-primary-hover)}
.dg-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dg-row--stack{flex-direction:column;align-items:stretch;gap:10px}
.dg-rowText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px}
.dg-rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dg-rowDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.dg-control{display:inline-flex;align-items:center;gap:8px}
.dg-step{cursor:pointer;display:inline-flex;justify-content:center;align-items:center;width:28px;height:28px;padding:0;border:none;border-radius:14px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:16px;line-height:16px}
.dg-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dg-step:disabled{color:var(--dsw-alias-label-caption);cursor:default}
.dg-stepValue{display:inline-flex;justify-content:center;align-items:center;min-width:44px;height:28px;padding:0 4px;box-sizing:border-box;border-radius:14px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-variant-numeric:tabular-nums}
.dg-unit{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.dg-switch{position:relative;flex:none;width:40px;height:24px;padding:0;border:none;border-radius:12px;cursor:pointer;background:var(--dsw-alias-bg-module-platform);transition:background .15s ease}
.dg-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform .15s ease}
.dg-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dg-switch[aria-checked="true"]::after{transform:translateX(16px)}
.dg-count{display:inline-flex;align-items:center;justify-content:center;min-width:72px;height:36px;padding:0 14px;box-sizing:border-box;border-radius:18px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-variant-numeric:tabular-nums}
.dg-textarea{width:100%;min-height:96px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;resize:vertical}
.dg-input{width:100%;box-sizing:border-box;${FIELD}}
.dg-textarea:focus,.dg-input:focus{outline:none;border-color:var(--dsw-alias-border-l4)}
.dg-button{cursor:pointer;flex:none;height:32px;padding:0 14px;border:none;border-radius:16px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px}
.dg-button:hover{background:var(--dsw-alias-interactive-bg-active)}
.dg-empty{padding:10px 12px;color:var(--dsw-alias-label-caption);font-size:13px;line-height:20px}
.dg-toast{position:fixed;right:24px;bottom:96px;z-index:9999;display:flex;align-items:center;gap:10px;max-width:360px;padding:12px 16px;border-radius:16px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;animation:dg-toast-in .18s ease-out}
.dg-toastMark{flex:none;display:inline-flex;justify-content:center;align-items:center;width:24px;height:24px;border-radius:12px;background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 18%, transparent);color:var(--dsw-alias-state-warning-primary)}
.dg-toastText{flex:1;min-width:0}
.dg-toastSub{display:block;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
@keyframes dg-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
`;

    const STYLE_TAG = 'dsh-degeneration-guard/panel.css';

    /** 注入一次本插件的样式；重复挂载不重复插。 */
    function injectStyle() {
      if (typeof document === 'undefined') {
        return;
      }
      if (document.querySelector('style[data-plugin-css="' + STYLE_TAG + '"]') !== null) {
        return;
      }
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-degeneration-guard';
      tag.dataset.pluginCss = STYLE_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /** 数字步进器。 */
    function Stepper(props) {
      const { value, min, max, label, onChange } = props;
      return h(
        'span',
        { className: 'dg-control' },
        h(
          'button',
          {
            type: 'button',
            className: 'dg-step',
            'aria-label': '减小' + label,
            disabled: value <= min,
            onClick: () => {
              onChange(value - 1);
            },
          },
          '−',
        ),
        h('span', { className: 'dg-stepValue' }, String(value)),
        h(
          'button',
          {
            type: 'button',
            className: 'dg-step',
            'aria-label': '增大' + label,
            disabled: value >= max,
            onClick: () => {
              onChange(value + 1);
            },
          },
          '+',
        ),
        h('span', { className: 'dg-unit' }, '次'),
      );
    }

    /** 开关。 */
    function Switch(props) {
      const { checked, label, onChange } = props;
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        className: 'dg-switch',
        onClick: () => {
          onChange(!checked);
        },
      });
    }

    /** 一行设置。 */
    function Row(props) {
      const { title, desc, control, stack, children } = props;
      return h(
        'div',
        { className: stack ? 'dg-row dg-row--stack' : 'dg-row' },
        h(
          'div',
          { className: 'dg-rowText' },
          h('div', { className: 'dg-rowTitle' }, title),
          desc ? h('div', { className: 'dg-rowDesc' }, desc) : null,
        ),
        control || null,
        children || null,
      );
    }

    /** 设置表单：改动先留在本地，点保存才写。 */
    function Form(props) {
      const { initial, count, onReset, onSave } = props;
      const [threshold, setThreshold] = React.useState(initial.threshold);
      const [inlineRepeat, setInlineRepeat] = React.useState(initial.inlineRepeat);
      const [autoResume, setAutoResume] = React.useState(initial.autoResume);
      const [resumeText, setResumeText] = React.useState(initial.resumeText);
      const [resumeSummary, setResumeSummary] = React.useState(initial.resumeSummary);
      const [note, setNote] = React.useState('');

      function save() {
        setNote('保存中…');
        onSave({
          threshold,
          inlineRepeat,
          autoResume,
          resumeText,
          resumeSummary,
        })
          .then(() => {
            setNote('已保存');
          })
          .catch((error) => {
            setNote('保存失败：' + String(error));
          });
      }

      function reset() {
        onReset()
          .then(() => {
            setNote('计数已清零');
          })
          .catch((error) => {
            setNote('清零失败：' + String(error));
          });
      }

      return h(
        'div',
        { className: 'dg-root' },
        h(
          'div',
          { className: 'dg-head' },
          h('span', { className: 'dg-headTitle' }, '复读打断'),
          h('span', { className: 'dg-headNote' }, note),
          h(
            'button',
            { type: 'button', className: 'dg-save', onClick: save },
            '保存',
          ),
        ),

        h(Row, {
          title: '累计拦截',
          desc: '自上次清零以来的拦截次数',
          control: h(
            'span',
            { className: 'dg-control' },
            h('span', { className: 'dg-count' }, String(count) + ' 次'),
            h(
              'button',
              { type: 'button', className: 'dg-button', onClick: reset },
              '清零',
            ),
          ),
        }),

        h(Row, {
          title: '重复次数阈值',
          desc: '同一句在最近几行里出现几次才判定复读；2 最敏感，3 最稳',
          control: h(Stepper, {
            value: threshold,
            min: THRESHOLD_MIN,
            max: THRESHOLD_MAX,
            label: '重复次数阈值',
            onChange: (next) => {
              setThreshold(next);
              setNote('');
            },
          }),
        }),

        h(Row, {
          title: '行内重复检测',
          desc: '拦截“好。好。好。”这种挤在一行里的重复；关闭时只检测独立段落（跨换行）',
          control: h(Switch, {
            checked: inlineRepeat,
            label: '行内重复检测',
            onChange: (next) => {
              setInlineRepeat(next);
              setNote('');
            },
          }),
        }),

        h(Row, {
          title: '自动继续',
          desc: '打断后自动把下一步推给模型，不需要你手动继续',
          control: h(Switch, {
            checked: autoResume,
            label: '自动继续',
            onChange: (next) => {
              setAutoResume(next);
              setNote('');
            },
          }),
        }),

        h(Row, {
          title: '拦截提示词',
          desc: '打断后推给模型的那一段。支持占位符 {count}（第几次）与 {line}（触发的那一行）',
          stack: true,
          children: h('textarea', {
            className: 'dg-textarea',
            value: resumeText,
            onChange: (event) => {
              setResumeText(event.target.value);
              setNote('');
            },
          }),
        }),

        h(Row, {
          title: '提示摘要',
          desc: '聊天里那条折叠提示的文字，仅你可见；同样支持 {count} 与 {line}',
          stack: true,
          children: h('input', {
            className: 'dg-input',
            value: resumeSummary,
            onChange: (event) => {
              setResumeSummary(event.target.value);
              setNote('');
            },
          }),
        }),
      );
    }

    /** 右下角浮窗：拦截发生时弹一次，几秒后自动消失。 */
    function ToastView(props) {
      const { form } = props;
      const [notice, setNotice] = React.useState(null);
      const timer = React.useRef(0);

      React.useEffect(() => {
        let last = 0;
        try {
          const snapshot = form.getSnapshot();
          last = typeof snapshot.value?.count === 'number' ? snapshot.value.count : 0;
        } catch {
          last = 0;
        }
        const off = form.subscribe(() => {
          let value;
          try {
            value = form.getSnapshot().value;
          } catch {
            return;
          }
          if (value === undefined || value === null) {
            return;
          }
          const next = value.count;
          if (typeof next !== 'number') {
            return;
          }
          if (next > last) {
            last = next;
            setNotice({
              count: next,
              autoResume: value.autoResume !== false,
            });
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              setNotice(null);
            }, 5200);
          } else if (next < last) {
            last = next;
          }
        });
        return () => {
          off();
          clearTimeout(timer.current);
        };
      }, []);

      if (notice === null) {
        return null;
      }
      return h(
        'div',
        { className: 'dg-toast', role: 'status', 'aria-live': 'polite' },
        h(
          'span',
          { className: 'dg-toastMark', 'aria-hidden': 'true' },
          h(
            'svg',
            {
              width: 14,
              height: 14,
              viewBox: '0 0 14 14',
              fill: 'none',
            },
            h('path', {
              d: 'M7 1.6 13 12H1L7 1.6Z',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinejoin: 'round',
            }),
            h('path', {
              d: 'M7 5.4v3.1',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
            }),
            h('circle', { cx: 7, cy: 10.2, r: 0.8, fill: 'currentColor' }),
          ),
        ),
        h(
          'span',
          { className: 'dg-toastText' },
          '检测到复读，已打断',
          h(
            'span',
            { className: 'dg-toastSub' },
            '第 ' +
              String(notice.count) +
              ' 次 · ' +
              (notice.autoResume ? '已自动继续' : '请手动继续'),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'configForms'],
      apply(ctx) {
        injectStyle();
        const form = ctx.configForms.get(ENTRY_ID);

        function Panel() {
          const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot());
          React.useEffect(() => form.subscribe(() => {
            setSnapshot(form.getSnapshot());
          }), []);
          const value = snapshot.value;
          if (snapshot.status !== 'ready' || value === undefined) {
            return h('div', { className: 'dg-empty' }, '配置尚未就绪（' + snapshot.status + '）');
          }
          return h(Form, {
            initial: value,
            count: value.count,
            onReset: async () => {
              await form.set('count', 0);
            },
            onSave: async (next) => {
              await form.set('threshold', next.threshold);
              await form.set('inlineRepeat', next.inlineRepeat);
              await form.set('autoResume', next.autoResume);
              await form.set('resumeText', next.resumeText);
              await form.set('resumeSummary', next.resumeSummary);
            },
          });
        }

        function ToastHost() {
          return h(ToastView, { form });
        }

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'degeneration-guard', order: 100, label: '复读打断' },
            Panel,
          ),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'degeneration-guard-toast', order: 60 },
            ToastHost,
          ),
        );
      },
    };
  },
});
