// 官方 chunk-931 module 1242 复刻：审批通知 fieldset（alpha.10 wire 取证，2026-10-14）。
// 节点 config.notifications = todo 组（审批待办分配时通知审批人，变量集 LY）；
// 触发器 config.notifications = done 组（审批完成时通知申请人，变量集 N5）。
// 行结构：[渠道 Select(禁用, 0 0 12em)] [Template/Custom Select] [模板 RemoteSelect | 配置模板按钮]
// [删除]; 列表下方 Add channel Select(placeholder 添加渠道) + 说明文字。
// client-v2 lane 定位：v3 settings 壳 workflow 配置面适配层——通知 fieldset 属
// 触发器/节点配置面板本体，1:1 保留（翻译钩子改由 models/i18n.js 提供）。
const React = require('react');
const {
  Button, ConfigProvider, Form, Input, InputNumber, Modal, Select, Space, Typography, theme,
} = require('antd');
const { DeleteOutlined } = require('@ant-design/icons');
const flowEngine = require('@nocobase/flow-engine');
const workflowClient = require('@nocobase/plugin-workflow/client-v2');
// antd 5.6（alpha.9 宿主）没有 Flex/Space.Compact/ConfigProvider.useConfig；RemoteSelect 在宿主 client-v2 包
let hostClientV2 = null;
try {
  hostClientV2 = require('@nocobase/client-v2');
} catch (e) {
  hostClientV2 = null;
}
const RemoteSelect = hostClientV2?.RemoteSelect;
const { NOTIFICATION_KIND: KIND, TEMPLATE_TYPE: TTYPE } = require('./shared');
const { useApprovalTranslate } = require('./i18n');

let nmClient = null;
try {
  nmClient = require('@nocobase/plugin-notification-manager/client-v2');
} catch (e) {
  nmClient = null;
}

async function api(action, params) {
  const token = window.localStorage.getItem('NOCOBASE_TOKEN');
  const qs = params ? '?' + new URLSearchParams(cleanParams(params)).toString() : '';
  const res = await fetch(`/api/${action}${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'X-Data-Source': 'main' },
    credentials: 'include',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return data;
}

function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

// module 358: Fk todo/done, es template/custom, N4 options, 8401 dy labels
const NOTIFICATION_META = {
  [KIND.TODO]: {
    label: 'Todo notifications',
    description: 'Send notifications to assignees when approval todo is assigned.',
  },
  [KIND.DONE]: {
    label: 'Done notifications',
    description: 'Send notifications to applicant when approval is done.',
  },
};

const CHANNEL_FLEX = '12em';

function emptyObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function formatPathToValue(item) {
  const paths = item?.paths ?? [];
  return paths.length ? `{{${paths.join('.')}}}` : '';
}

function insertAtCaret(value, insert, start, end) {
  const v = typeof value === 'string' ? value : '';
  const s = Math.max(0, Math.min(start, v.length));
  const e = Math.max(s, Math.min(end, v.length));
  return { nextValue: v.slice(0, s) + insert + v.slice(e), nextCaret: s + insert.length };
}

const RESERVED_ROOTS = ['approval', 'system', '$system', '$context', '$jobsMapByNodeKey', '$scopes'];
// 官方 k：todo 组 approval 子键按此顺序呈现
const APPROVAL_KEY_ORDER = ['workflowTitle', 'approvalId', 'dataKey', 'nodeTitle', 'approvalRecordTitle', 'approvalRecordId'];

function useNotificationMetaTree(variableOptions, type) {
  const t = useApprovalTranslate();
  return React.useMemo(() => {
    const options = Array.isArray(variableOptions) ? variableOptions : [];
    const byName = new Map(options.map((o) => [o.name, o]));
    const approval = byName.get('approval');
    const roots = [];
    if (approval) {
      const children = Array.isArray(approval.children) ? approval.children : [];
      const hasRecordKeys = children.some((c) => ['nodeTitle', 'approvalRecordTitle', 'approvalRecordId'].includes(String(c.name)));
      // 官方 N()：todo 组只保留 k 序六键并把组名改为"当前审批记录"；done 组把其余变量并进子级
      const approvalChildren = hasRecordKeys
        ? APPROVAL_KEY_ORDER.map((name) => children.find((c) => c.name === name)).filter(Boolean)
        : children.concat(options.filter((o) => !RESERVED_ROOTS.includes(o.name)));
      roots.push({ ...approval, title: t(hasRecordKeys ? 'Current approval record' : 'Approval'), children: approvalChildren });
    }
    for (const o of options) {
      if (RESERVED_ROOTS.includes(o.name)) continue;
      roots.push(o);
    }
    const context = byName.get('$context');
    if (context) {
      roots.push({ ...context, title: t('Trigger variables', { ns: 'workflow' }) });
    }
    const system = byName.get('$system') ?? byName.get('system');
    if (system) {
      roots.push({ ...system, name: '$system', title: t('System variables', { ns: 'workflow' }) });
    }
    const seen = new Set();
    return roots.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }, [variableOptions, type, t]);
}

// 官方 M：Space.Compact[Input + FlowContextSelector("x")]，光标处插入 {{path}}
function TemplateVariableInput({ metaTree, onChange, value = '' }) {
  const { componentDisabled } = ConfigProvider.useConfig?.() ?? {};
  const [inner, setInner] = React.useState(value);
  const inputRef = React.useRef(null);
  const metaTreeFn = React.useMemo(() => () => metaTree, [metaTree]);
  React.useEffect(() => setInner(value ?? ''), [value]);
  const onTextChange = (e) => {
    setInner(e.target.value);
    onChange?.(e.target.value);
  };
  const onInsert = (path) => {
    if (!path) return;
    const el = inputRef.current?.input;
    const insert = formatPathToValue(path);
    if (!el) {
      const next = `${inner}${insert}`;
      setInner(next);
      onChange?.(next);
      return;
    }
    const { nextValue, nextCaret } = insertAtCaret(inner, insert, el.selectionStart ?? inner.length, el.selectionEnd ?? el.selectionStart ?? inner.length);
    setInner(nextValue);
    onChange?.(nextValue);
    requestAnimationFrame(() => {
      el.setSelectionRange(nextCaret, nextCaret);
      el.focus();
    });
  };
  const Selector = flowEngine?.FlowContextSelector;
  return React.createElement(
    'div',
    { style: { display: 'flex', width: '100%' } },
    React.createElement(Input, { ref: inputRef, value: inner, onChange: onTextChange, style: { width: '100%' } }),
    Selector
      ? React.createElement(
          Selector,
          {
            disabled: componentDisabled,
            dropdownFooter: null,
            metaTree: metaTreeFn,
            formatPathToValue,
            onChange: onInsert,
          },
          React.createElement(Button, { style: { fontFamily: 'New York, Times New Roman, Times, serif', fontStyle: 'italic' }, type: 'default' }, 'x'),
        )
      : null,
  );
}

// 官方 I：TextArea 变体（delimiters 定制，content 用 {{{ }}}）
function TemplateContentInput({ metaTree, onChange, value = '', delimiters = ['{{', '}}'], autoSize, placeholder }) {
  const { componentDisabled } = ConfigProvider.useConfig?.() ?? {};
  const [inner, setInner] = React.useState(value);
  const ref = React.useRef(null);
  const metaTreeFn = React.useMemo(() => () => metaTree, [metaTree]);
  React.useEffect(() => setInner(value ?? ''), [value]);
  const onTextChange = (e) => {
    setInner(e.target.value);
    onChange?.(e.target.value);
  };
  const onInsert = (path) => {
    if (!path) return;
    const el = ref.current?.resizableTextArea?.textArea;
    const insert = `${delimiters[0]}${formatPathToValue(path).slice(2, -2)}${delimiters[1]}`;
    if (!el) {
      const next = `${inner}${insert}`;
      setInner(next);
      onChange?.(next);
      return;
    }
    const { nextValue, nextCaret } = insertAtCaret(inner, insert, el.selectionStart ?? inner.length, el.selectionEnd ?? el.selectionStart ?? inner.length);
    setInner(nextValue);
    onChange?.(nextValue);
    requestAnimationFrame(() => {
      el.setSelectionRange(nextCaret, nextCaret);
      el.focus();
    });
  };
  const Selector = flowEngine?.FlowContextSelector;
  return React.createElement(
    'div',
    { style: { display: 'flex', width: '100%' } },
    React.createElement(Input.TextArea, { ref, value: inner, onChange: onTextChange, autoSize, placeholder, style: { width: '100%' } }),
    Selector
      ? React.createElement(
          Selector,
          { disabled: componentDisabled, dropdownFooter: null, metaTree: metaTreeFn, formatPathToValue, onChange: onInsert },
          React.createElement(Button, { style: { fontFamily: 'New York, Times New Roman, Times, serif', fontStyle: 'italic' }, type: 'default' }, 'x'),
        )
      : null,
  );
}

// 官方 N：站内信自定义模板编辑字段（title/content/options.url/options.mobileUrl/options.duration）
function InAppTemplateFields({ namePrefix, variableOptions }) {
  const t = useApprovalTranslate();
  const metaTree = useNotificationMetaTree(variableOptions, KIND.TODO);
  const linkExtra = t('Support two types of links: internal links and external links. If using an internal link, the link starts with "/", for example, "/admin". If using an external link, the link starts with "http", for example, "https://example.com".');
  const mobileExtra = t('Support two types of links: internal links and external links. If using an internal link, the link starts with "/", for example, "/m". If using an external link, the link starts with "http", for example, "https://example.com".');
  const required = { required: true, message: t('The field value is required') };
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Form.Item,
      { label: t('Message title'), name: [...namePrefix, 'title'], rules: [required] },
      React.createElement(TemplateVariableInput, { metaTree }),
    ),
    React.createElement(
      Form.Item,
      { label: t('Message content'), name: [...namePrefix, 'content'], rules: [required] },
      React.createElement(TemplateContentInput, { metaTree, autoSize: { minRows: 8 }, delimiters: ['{{{', '}}}'], placeholder: 'Hi,' }),
    ),
    React.createElement(
      Form.Item,
      { extra: linkExtra, label: t('Details page for desktop'), name: [...namePrefix, 'options', 'url'] },
      React.createElement(TemplateVariableInput, { metaTree }),
    ),
    React.createElement(
      Form.Item,
      { extra: mobileExtra, label: t('Details page for mobile'), name: [...namePrefix, 'options', 'mobileUrl'] },
      React.createElement(TemplateVariableInput, { metaTree }),
    ),
    React.createElement(
      Form.Item,
      {
        className: 'nb-approval-notification-template-close-after',
        extra: t('Unit is second. Will not close automatically when set to empty.'),
        initialValue: 5,
        label: t('Close after'),
        name: [...namePrefix, 'options', 'duration'],
        style: { marginBottom: 0 },
      },
      React.createElement(InputNumber, { style: { width: '100%' } }),
    ),
  );
}

// 官方 D：配置模板弹窗（自定义 templateType 的值编辑器）
function ConfigureTemplateButton({ channelType, onChange, value, variableOptions }) {
  const t = useApprovalTranslate();
  const [open, setOpen] = React.useState(false);
  const [form] = Form.useForm();
  React.useEffect(() => {
    if (open) form.setFieldsValue({ template: emptyObject(value) });
  }, [form, open, value]);
  const onOk = async () => {
    const values = await form.validateFields();
    onChange?.(emptyObject(values.template));
    setOpen(false);
  };
  const ContentForm = channelType !== 'in-app-message' && nmClient?.ContentConfigForm;
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Button, { type: 'link', onClick: () => setOpen(true) }, t('Configure template')),
    React.createElement(Modal, {
      cancelText: t('Cancel'),
      className: 'nb-approval-notification-template-modal',
      destroyOnClose: true,
      okText: t('Submit'),
      onCancel: () => { form.resetFields(); setOpen(false); },
      onOk,
      open,
      title: t('Configure template'),
      width: '40%',
    },
    React.createElement(
      Form,
      { colon: false, form, layout: 'vertical', style: { width: '100%' } },
      channelType === 'in-app-message' || !ContentForm
        ? React.createElement(InAppTemplateFields, { namePrefix: ['template'], variableOptions })
        : React.createElement(ContentForm, { channelType, namePrefix: ['template'], variableOptions }),
    ),
    ),
  );
}

// 官方 z：模板字段（custom → 配置模板；template → approvalMsgTpls RemoteSelect）
function TemplateField({ channels, className, fieldName, listName, style, type, variableOptions }) {
  const t = useApprovalTranslate();
  const form = Form.useFormInstance();
  const entry = Form.useWatch([...listName, fieldName], form);
  const channel = (channels ?? []).find((c) => c.name === entry?.channel);
  const notificationType = channel?.notificationType;
  if (!entry?.channel) return null;
  if (entry.templateType === TTYPE.CUSTOM) {
    return React.createElement(
      Form.Item,
      {
        className,
        name: [fieldName, 'template'],
        rules: [{
          validator: (rule, val) => (Object.keys(emptyObject(val)).length > 0 ? Promise.resolve() : Promise.reject(new Error(t('The field value is required')))),
        }],
        style,
      },
      React.createElement(ConfigureTemplateButton, { channelType: notificationType, variableOptions }),
    );
  }
  if (RemoteSelect) {
    return React.createElement(
      Form.Item,
      { className, name: [fieldName, 'template'], rules: [{ required: true, message: t('The field value is required') }], style },
      React.createElement(RemoteSelect, {
        'aria-label': t('Message template'),
        request: async () => {
          const d = await api('approvalMsgTpls:list', { pageSize: 200, filter: { notificationType, type } });
          return d?.data ?? [];
        },
        mapOptions: (o) => ({ label: String(o.title ?? o.id), value: o.id }),
        ready: !!notificationType,
      }),
    );
  }
  // 宿主缺 RemoteSelect 时的兜底：普通 Select 自行拉取模板列表
  return React.createElement(
    Form.Item,
    { className, name: [fieldName, 'template'], rules: [{ required: true, message: t('The field value is required') }], style },
    React.createElement(PlainTemplateSelect, { disabled: !notificationType, notificationType, type }),
  );
}

function PlainTemplateSelect({ disabled, notificationType, type }) {
  const t = useApprovalTranslate();
  const [options, setOptions] = React.useState([]);
  React.useEffect(() => {
    if (!notificationType) return;
    let alive = true;
    api('approvalMsgTpls:list', { pageSize: 200, filter: { notificationType, type } })
      .then((d) => alive && setOptions((d?.data ?? []).map((o) => ({ label: String(o.title ?? o.id), value: o.id }))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [notificationType, type]);
  return React.createElement(Select, { 'aria-label': t('Message template'), disabled, options });
}

// 官方 useVariables 变量集（module 3362 LY/N5）
function useTodoTemplateVariables() {
  const t = useApprovalTranslate();
  return React.useMemo(() => {
    const group = (name, title, children) => ({ name, title: title, type: 'string', paths: [name], children });
    const leaf = (root, name, title) => ({ name, title, type: 'string', paths: [root, name] });
    return [
      group('applicant', t('Applicant'), [leaf('applicant', 'nickname', t('Nickname', { ns: 'client' }))]),
      group('approval', t('Approval'), [
        leaf('approval', 'workflowTitle', t('Workflow title')),
        leaf('approval', 'approvalId', t('Approval ID')),
        leaf('approval', 'dataKey', t('Approval data key')),
        leaf('approval', 'nodeTitle', t('Task node')),
        leaf('approval', 'approvalRecordTitle', t('Task title')),
        leaf('approval', 'approvalRecordId', t('Task ID')),
      ]),
    ];
  }, [t]);
}

function useDoneTemplateVariables() {
  const t = useApprovalTranslate();
  return React.useMemo(() => {
    const group = (name, title, children) => ({ name, title: title, type: 'string', paths: [name], children });
    const leaf = (root, name, title) => ({ name, title, type: 'string', paths: [root, name] });
    return [
      group('statusText', t('Status', { ns: 'workflow' }), undefined),
      group('approval', t('Approval'), [
        leaf('approval', 'workflowTitle', t('Workflow title')),
        leaf('approval', 'approvalId', t('Approval ID')),
        leaf('approval', 'dataKey', t('Approval data key')),
      ]),
    ];
  }, [t]);
}

// 官方 t.A：通知 Form.List
function NotificationList({ name = ['config', 'notifications'], type = KIND.TODO, useVariables }) {
  const t = useApprovalTranslate();
  const { token } = theme.useToken();
  const { componentDisabled } = ConfigProvider.useConfig?.() ?? {};
  const form = Form.useFormInstance();
  const workflowVariables = workflowClient.useWorkflowVariableOptions?.() ?? [];
  const [channels, setChannels] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    api('notificationChannels:list', { pageSize: 200 })
      .then((d) => {
        if (alive) setChannels((d?.data ?? []).map((c) => ({ name: c.name, notificationType: c.notificationType, title: c.title })));
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  const baseVariables = useVariables ? useVariables() : [];
  const variableOptions = React.useMemo(
    () => (Array.isArray(baseVariables) ? baseVariables : []).concat(Array.isArray(workflowVariables) ? workflowVariables : []),
    [baseVariables, workflowVariables],
  );
  const listValue = Form.useWatch(name, form);
  const meta = NOTIFICATION_META[type] ?? NOTIFICATION_META[KIND.TODO];
  const used = React.useMemo(() => {
    const set = new Set((Array.isArray(listValue) ? listValue : []).map((e) => e?.channel).filter(Boolean));
    return channels.filter((c) => !set.has(c.name)).map((c) => ({ label: c.title || c.name, value: c.name }));
  }, [channels, listValue]);
  const lineHeight = Math.round(token.fontSize * token.lineHeight);
  const typeWidth = 5 * token.controlHeightLG;
  const typeOptions = [
    { label: t('Template'), value: TTYPE.TEMPLATE },
    { label: t('Custom'), value: TTYPE.CUSTOM },
  ];
  return React.createElement(Form.List, { name }, (fields, { add, remove }) =>
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      React.createElement(
        Typography.Text,
        { className: 'nb-approval-notification-fieldset-label', style: { fontWeight: token.fontWeightStrong, lineHeight: `${lineHeight}px` } },
        `${t(meta.label)}:`,
      ),
      React.createElement(
        Space,
        { direction: 'vertical', size: 'small', style: { width: '100%' } },
        fields.map((field) =>
          React.createElement(
            'div',
            { key: field.key, className: 'nb-approval-notification-fieldset-row', style: { display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 16, paddingBlock: token.paddingXS, width: '100%' } },
            React.createElement(
              Form.Item,
              { className: 'nb-approval-notification-fieldset-channel', name: [field.name, 'channel'], rules: [{ required: true, message: t('The field value is required') }], style: { flex: `0 0 ${CHANNEL_FLEX}`, marginBottom: 0, minWidth: 0 } },
              React.createElement(Select, {
                'aria-label': t('Notification channel'),
                disabled: true,
                loading,
                options: channels.map((c) => ({ label: c.title || c.name, value: c.name })),
              }),
            ),
            React.createElement(
              Form.Item,
              { className: 'nb-approval-notification-fieldset-template-type', name: [field.name, 'templateType'], style: { flex: '0 0 auto', marginBottom: 0, width: typeWidth } },
              React.createElement(Select, {
                'aria-label': t('Template'),
                options: typeOptions,
                onChange: () => form.setFieldValue([...name, field.name, 'template'], undefined),
              }),
            ),
            React.createElement(TemplateField, {
              channels,
              className: 'nb-approval-notification-fieldset-template',
              fieldName: field.name,
              listName: name,
              style: { flex: '1 1 auto', marginBottom: 0, minWidth: 0 },
              type,
              variableOptions,
            }),
            React.createElement(Button, {
              'aria-label': t('Delete'),
              disabled: componentDisabled,
              icon: React.createElement(DeleteOutlined, null),
              onClick: () => {
                if (!componentDisabled) remove(field.name);
              },
              style: { flex: '0 0 auto' },
              type: 'text',
            }),
          ),
        ),
        React.createElement(Select, {
          'aria-label': t('Add channel'),
          disabled: componentDisabled || loading || used.length === 0,
          loading,
          onChange: (channel) => {
            if (componentDisabled) return;
            add({ channel, templateType: TTYPE.TEMPLATE });
          },
          options: used,
          placeholder: t('Add channel'),
          style: { width: CHANNEL_FLEX },
          value: null,
        }),
        meta.description
          ? React.createElement(
              Typography.Text,
              { className: 'nb-approval-notification-fieldset-description', style: { color: token.colorTextSecondary } },
              t(meta.description),
            )
          : null,
      ),
    ),
  );
}

module.exports = {
  NotificationList,
  useTodoTemplateVariables,
  useDoneTemplateVariables,
};
