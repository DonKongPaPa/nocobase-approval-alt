/**
 * Config fieldsets for the approval trigger / instruction, mirroring the
 * official client-v2 chunks (483: trigger fieldset, 617: node fieldset +
 * canvas component, 863: trigger test fieldset). Rendered by the workflow
 * client inside an antd Form whose values shape is { config: {...} }.
 *
 * client-v2 lane 定位：v3 settings 壳（/settings/workflow flow-engine 设计器）
 * 的 workflow 配置面适配层——触发器/审批节点字段集 + 画布组件。审批中心/任务卡/
 * 表单 UI 不在本 lane（由 v3 portal 扩展承载）：发起/审批「我的申请/审批卡片」
 * 配置入口已剥离（原 applyTaskCardModelOptions / task_card_ 分支）。
 */
const React = require('react');
const {
  Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Popover, Radio, Select, Space,
  Spin, Tag, Tooltip, Typography, message,
} = require('antd');
const {
  AppendsSelect, Branch, CollectionCascader, NodeDefaultView, TriggerCollectionRecordSelect,
  UsersSelect, WorkflowVariableInput, parseCollectionName, useCurrentWorkflowContext, useFlowContext,
  useNodeContext, useStyles,
} = require('@nocobase/plugin-workflow/client-v2');
let flowEnginePkg = null;
try {
  flowEnginePkg = require('@nocobase/flow-engine');
} catch (e) {
  flowEnginePkg = null;
}
const VariableInput = WorkflowVariableInput;
const {
  AssigneesFilterPanel: OfficialFilterPanel,
  AssigneeVariableInput: OfficialVariableInput,
  defaultFilterGroup: defaultUserFilterGroup,
  isFilterGroup: isUserFilterGroup,
  isUserFilterItem: isUserFilterItem,
} = require('./models/assigneesScope');
const { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } = require('@dnd-kit/core');
const {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} = require('@dnd-kit/sortable');

const { SettingOutlined, PlusOutlined, DeleteOutlined, HolderOutlined, EditOutlined } = require('@ant-design/icons');

// CC 抄送同款用户选择器（notification-manager 导出，用户指定照搬）
let CCUserSelect = null;
try {
  CCUserSelect = require('@nocobase/plugin-notification-manager/client-v2').UserSelect;
} catch (e) {
  CCUserSelect = null;
}

// 批9 裁撤：发起/审批「界面配置」入口（InterfaceConfigButton 族）整体移除——
// 用户裁决：发起界面配置也由 AI portal 的 AI 能力代替，settings 设计器不再承接；
// 存量 workflow 已配置的 approvalUid（flowModels 树）portal 读侧不受影响。
// 官方通知 fieldset（chunk-931/1242 复刻）：节点=todo 组、触发器=done 组
const {
  NotificationList,
  useTodoTemplateVariables,
  useDoneTemplateVariables,
} = require('./models/notificationsFieldset');
const { NOTIFICATION_KIND } = require('./models/shared');

// ------------------------------------------------------------------ helpers

async function api(action, params, body) {
  const token = window.localStorage.getItem('NOCOBASE_TOKEN');
  const isGet = body === undefined;
  const qs = params ? '?' + new URLSearchParams(cleanParams(params)).toString() : '';
  const res = await fetch(`/api/${action}${qs}`, {
    method: isGet ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Data-Source': 'main' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return data;
}

function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

function makeUid(prefix) {
  return (prefix ?? 'uid_') + Math.random().toString(36).slice(2, 12);
}

function splitCollection(value) {
  if (!value) return ['main', ''];
  if (value.includes(':')) {
    const parts = parseCollectionName(value);
    if (parts[0] && parts[1]) return parts;
  }
  return ['main', value];
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdById', 'updatedById', 'createdBy', 'updatedBy']);

function useCollectionFields(collection) {
  const [fields, setFields] = React.useState([]);
  React.useEffect(() => {
    const [, name] = splitCollection(collection);
    if (!name) {
      setFields([]);
      return;
    }
    let alive = true;
    api('collections:get', { filterByTk: name, appends: ['fields'] }).then((d) => {
      if (!alive) return;
      const raw = (d?.data?.fields ?? []).length ? d.data.fields : (d?.data?.values?.fields ?? []);
      const list = raw.filter((f) => !SYSTEM_FIELDS.has(f.name) && f.interface !== 'password');
      setFields(list.map((f) => ({ label: f.title || f.name, value: f.name })));
    }).catch(() => alive && setFields([]));
    return () => {
      alive = false;
    };
  }, [collection]);
  return fields;
}

function useUserOptions() {
  const [options, setOptions] = React.useState([]);
  const [kw, setKw] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => {
      api('users:list', {
        pageSize: 50,
        filter: kw ? { $or: [{ nickname: { $includes: kw } }, { username: { $includes: kw } }] } : {},
      }).then((d) => {
        setOptions((d?.data ?? []).map((u) => ({ value: u.id, label: u.nickname || u.username })));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [kw]);
  return { options, onSearch: setKw };
}

// ------------------------------------------------- trigger preset (create form)

function ApprovalTriggerPresetFieldset() {
  return React.createElement(
    Form.Item,
    { name: ['config', 'collection'], label: '数据表', rules: [{ required: true, message: '该字段值必填' }] },
    React.createElement(CollectionCascader),
  );
}

// ------------------------------------------------------- collection display

function CollectionDisplay({ value }) {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    const [ds, name] = splitCollection(value);
    if (!name) {
      setText('');
      return;
    }
    let alive = true;
    api('collections:get', { filterByTk: name }).then((d) => {
      if (!alive) return;
      const c = d?.data;
      setText(`${ds === 'main' ? 'Main' : ds} / ${c?.title || c?.name || name}`);
    }).catch(() => alive && setText(`${ds} / ${name}`));
    return () => {
      alive = false;
    };
  }, [value]);
  return React.createElement(Typography.Text, null, text);
}

// ------------------------------------------------------- who could initiate

function AudienceTypeField({ value = 1, onChange }) {
  const wf = useCurrentWorkflowContext?.() ?? {};
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState([]);
  const [saved, setSaved] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const { options, onSearch } = useUserOptions();

  const load = React.useCallback(() => {
    if (!wf?.id) return;
    api('approvalAudiences:list', { filter: { workflowId: wf.id }, paginate: false }).then((d) => {
      const rows = d?.data ?? [];
      setSaved(rows.reduce((acc, r) => ((acc[r.type] = [...(acc[r.type] ?? []), r.targetKey]), acc), {}));
    });
  }, [wf?.id]);

  const openModal = () => {
    setDraft(saved.users ?? []);
    setOpen(true);
  };
  const submit = async () => {
    setLoading(true);
    try {
      await api('approvalAudiences:destroy', { filter: { workflowId: wf.id } });
      const values = (draft ?? []).map((id) => ({ type: 'users', targetKey: id, workflowId: wf.id }));
      if (values.length) await api('approvalAudiences:create', {}, values);
      load();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return React.createElement(
    'div',
    {},
    React.createElement(Radio.Group, {
      value,
      onChange: (e) => onChange(Number(e.target.value)),
      options: [
        { value: 1, label: '所有用户' },
        { value: 0, label: '仅选择的用户' },
      ],
    }),
    value === 0
      ? React.createElement(
          Typography.Paragraph,
          { style: { background: 'rgba(0,0,0,0.02)', marginBottom: 0, paddingInline: 8, marginTop: 8 } },
          React.createElement(
            Space,
            {},
            React.createElement(Typography.Text, { type: 'secondary' },
              (saved.users ?? []).length ? `已选择 ${saved.users.length} 位用户` : '尚未选择用户'),
            React.createElement(Button, { icon: React.createElement(EditOutlined), type: 'link', onClick: openModal }, '选择'),
          ),
        )
      : null,
    React.createElement(
      Modal,
      {
        open,
        title: '谁可以发起',
        width: '40%',
        okText: '提交',
        cancelText: '取消',
        confirmLoading: loading,
        onCancel: () => setOpen(false),
        onOk: submit,
        destroyOnClose: true,
      },
      wf?.id
        ? React.createElement(Select, {
            mode: 'multiple',
            style: { width: '100%' },
            placeholder: '选择用户',
            options,
            onSearch,
            showSearch: true,
            filterOption: false,
            value: draft,
            onChange: setDraft,
          })
        : React.createElement(Alert, { type: 'warning', showIcon: true, message: '请先保存工作流后再选择用户。' }),
    ),
  );
}

// ------------------------------------------------------ trigger fieldset (config)

function ApprovalTriggerFieldset() {
  const form = Form.useFormInstance();
  const wf = useCurrentWorkflowContext?.() ?? {};
  const collection = Form.useWatch(['config', 'collection'], form);
  const centralized = Form.useWatch(['config', 'centralized'], form);
  const useSame = Form.useWatch(['config', 'useSameTaskTitle'], form);
  const defaultTitle = [wf?.triggerTitle, wf?.title].find((x) => typeof x === 'string');

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Form.Item,
      { name: ['config', 'collection'], hidden: true, rules: [{ required: true, message: '该字段值必填' }] },
      React.createElement(Input),
    ),
    React.createElement(Form.Item, { name: ['config', 'withdrawable'], hidden: true }, React.createElement(Input)),
    React.createElement(Form.Item, { label: '数据表' }, React.createElement(CollectionDisplay, { value: collection })),
    React.createElement(
      Form.Item,
      { name: ['config', 'mode'], label: '触发方式', initialValue: 0 },
      React.createElement(
        Radio.Group,
        {},
        React.createElement(Tooltip, { title: '数据在审批通过后才会保存。' }, React.createElement(Radio, { value: 1 }, '数据保存前')),
        React.createElement(Tooltip, { title: '先保存数据，再开始审批流程。' }, React.createElement(Radio, { value: 0 }, '数据保存后')),
      ),
    ),
    React.createElement(
      Form.Item,
      { name: ['config', 'centralized'], label: '发起位置', initialValue: false },
      React.createElement(
        Radio.Group,
        { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        React.createElement(Tooltip, { title: '任意表单区块中的操作按钮都可以绑定该工作流发起审批，审批的处理与跟踪在单条记录的审批区块中进行，通常适用于业务数据。' },
          React.createElement(Radio, { value: false }, '仅数据区块中发起')),
        React.createElement(Tooltip, { title: '除数据区块外，用户还可以在待办中心发起并处理审批，通常适用于行政类数据。' },
          React.createElement(Radio, { value: true }, '数据区块和待办中心中均可发起')),
      ),
    ),
    React.createElement(
      Form.Item,
      { name: ['config', 'audienceType'], label: '谁可以发起', initialValue: 1 },
      React.createElement(AudienceTypeField),
    ),
    centralized
      ? React.createElement(
          Form.Item,
          {
            name: ['config', 'usageInstructions'],
            label: '使用说明',
            extra: '说明用户应在何时、如何发起该审批。该文字将显示在待办中心的审批列表中。',
          },
          React.createElement(Input.TextArea, { placeholder: '点击发起审批', autoSize: { minRows: 3, maxRows: 8 } }),
        )
      : null,
    collection
      ? React.createElement(
          React.Fragment,
          null,
          // 批9 裁撤：发起界面（approvalUid）配置入口——AI portal 代替；存量
          // approvalUid（flowModels 树）portal 读侧不受影响。config.taskCardUid
          // 「我的申请卡片」配置入口同批5 剥离（任务卡 UI 由 v3 portal 承载）。
          React.createElement(
            Form.Item,
            { name: ['config', 'recordShowMode'], label: '流程中的记录显示方式', initialValue: false },
            React.createElement(
              Radio.Group,
              {},
              React.createElement(Tooltip, { title: '申请人和审批人进入时看到的是当时的记录快照；提交后仅能看到自己修改的内容，看不到其他人后来的更新。' },
                React.createElement(Radio, { value: false }, '快照')),
              React.createElement(Tooltip, { title: '申请人和审批人在流程中始终看到记录的最新版本；流程结束后看到最终版本。' },
                React.createElement(Radio, { value: true }, '最新')),
            ),
          ),
          React.createElement(
            Form.Item,
            {
              name: ['config', 'appends'],
              label: '预加载关联',
              extra: '请选择后续节点需要访问的关联字段。超过两级的一对多关联可能引发性能问题，请谨慎使用。',
            },
            React.createElement(AppendsSelect, { collection }),
          ),
        )
      : null,
    React.createElement(Form.Item, { name: ['config', 'associationShowMode'], hidden: true }, React.createElement(Input)),
    React.createElement(
      Form.Item,
      {
        name: ['config', 'useSameTaskTitle'],
        valuePropName: 'checked',
        initialValue: false,
        extra: '勾选后，工作流中的所有审批节点将使用相同的任务标题；否则使用各节点中配置的标题。',
      },
      React.createElement(Checkbox, null, '所有审批节点使用相同任务标题'),
    ),
    useSame
      ? React.createElement(
          Form.Item,
          { name: ['config', 'taskTitle'], label: '任务标题', initialValue: defaultTitle },
          React.createElement(VariableInput, null),
        )
      : null,
    React.createElement(
      Form.Item,
      { label: '自动通过' },
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          Form.Item,
          { name: ['config', 'autoPassIfApprovedInRound'], valuePropName: 'checked', initialValue: false, noStyle: true },
          React.createElement(Checkbox, null, '当前轮次中审批人已通过时自动通过'),
        ),
        React.createElement(
          Form.Item,
          { name: ['config', 'autoPassIfApplicant'], valuePropName: 'checked', initialValue: false, noStyle: true },
          React.createElement(Checkbox, null, '审批人是申请人时自动通过'),
        ),
      ),
    ),
    // 官方触发器 done 组：审批完成时通知申请人（config.notifications）
    React.createElement(NotificationList, {
      name: ['config', 'notifications'],
      type: NOTIFICATION_KIND.DONE,
      useVariables: useDoneTemplateVariables,
    }),
  );
}

// ------------------------------------------------------ trigger test fieldset

function RemotePick({ value, onChange, resource, labelField, valueField }) {
  const [options, setOptions] = React.useState([]);
  React.useEffect(() => {
    api(`${resource}:list`, { paginate: false, pageSize: 200 }).then((d) => {
      setOptions((d?.data ?? []).map((r) => ({ value: String(r[valueField]), label: String(r[labelField] ?? r[valueField]) })));
    });
  }, [resource, labelField, valueField]);
  return React.createElement(Select, {
    value,
    onChange,
    showSearch: true,
    options,
    filterOption: (i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase()),
  });
}

function ApprovalTriggerTestFieldset() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Form.Item,
      { name: 'data', label: '触发数据', extra: '选择数据表中的一条记录或其主键来触发。', rules: [{ required: true, message: '该字段值必填' }] },
      React.createElement(TriggerCollectionRecordSelect),
    ),
    React.createElement(
      Form.Item,
      { name: 'applicantId', label: '申请人', rules: [{ required: true, message: '该字段值必填' }] },
      React.createElement(RemotePick, { resource: 'users', labelField: 'nickname', valueField: 'id' }),
    ),
    React.createElement(
      Form.Item,
      { name: 'applicantRoleName', label: '申请人角色' },
      React.createElement(RemotePick, { resource: 'roles', labelField: 'title', valueField: 'name' }),
    ),
  );
}

// ---------------------------------------------------------- node fieldsets

function ApprovalNodePresetFieldset() {
  return React.createElement(
    Form.Item,
    { name: ['config', 'branchMode'], label: '模式', initialValue: false, rules: [{ required: true }] },
    React.createElement(
      Radio.Group,
      {},
      React.createElement(Radio, { value: false }, '直通模式'),
      React.createElement(Radio, { value: true }, '分支模式'),
    ),
  );
}

const NEGOTIATION_TIPS = {
  0: '其中任意一人通过或拒绝即为结果。',
  1: '全部通过才算通过，任意一人拒绝则拒绝。',
  vote: '通过率大于设定百分比时通过，否则拒绝。',
};

function NegotiationRadio({ value = 0, onChange, disabled }) {
  const isVoting = typeof value === 'number' && value > 0 && value < 1;
  const kind = isVoting ? '%' : value;
  const radio = (v, label) =>
    React.createElement(Tooltip, { title: NEGOTIATION_TIPS[v === '%' ? 'vote' : v], placement: 'bottom' },
      React.createElement(Radio, { value: v, disabled }, label));
  return React.createElement(
    Space,
    { direction: 'vertical' },
    React.createElement(
      Radio.Group,
      { value: kind, onChange: (e) => onChange(e.target.value === '%' ? 0.5 : e.target.value), disabled },
      React.createElement(Space, { wrap: true }, radio(0, '或签'), radio(1, '会签'), radio('%', '投票')),
    ),
    kind === '%'
      ? React.createElement(InputNumber, {
          addonBefore: '>',
          min: 1,
          max: 99,
          value: Math.round(value * 100),
          onChange: (v) => onChange(Number(v ?? 50) / 100),
          addonAfter: '%',
          disabled,
          style: { width: 180 },
        })
      : null,
  );
}

function AssigneeRow({ id, item, onRemove, onUpdate, disabled, sortDisabled }) {
  // 节点配置抽屉渲染在 FlowContext 之外，只能从 flow-engine 全局实例拿数据源管理器
  const engine = flowEnginePkg?.useFlowEngine?.({ throwError: false });
  const usersCollection =
    engine?.context?.dataSourceManager?.getCollection?.('main', 'users') ??
    flowEnginePkg?.FlowEngine?.instance?.context?.dataSourceManager?.getCollection?.('main', 'users');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: sortDisabled });
  // 用普通 flex div（CC/官方同款 Flex 布局）；antd Space 的 item 包装层不吃 flex:1，会把选择器挤窄
  return React.createElement(
    'div',
    {
      ref: setNodeRef,
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        width: '100%',
        position: isDragging ? 'relative' : undefined,
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
        zIndex: isDragging ? 1 : undefined,
      },
    },
    React.createElement(Button, {
      ref: setActivatorNodeRef,
      disabled: sortDisabled,
      icon: React.createElement(HolderOutlined),
      size: 'small',
      type: 'text',
      style: { cursor: sortDisabled ? 'not-allowed' : 'grab', height: 32, minWidth: 16, paddingInline: 0, width: 16 },
      'aria-label': '排序审批人',
      ...attributes,
      ...listeners,
    }),
    React.createElement(
      'div',
      { style: { flex: 1, minWidth: 0 } },
      renderAssigneeValue(item, onUpdate, disabled, usersCollection),
    ),
    React.createElement(Button, {
      disabled,
      icon: React.createElement(DeleteOutlined),
      onClick: onRemove,
      type: 'text',
      style: { color: 'rgba(0,0,0,0.45)', height: 32, minWidth: 24, paddingInline: 0, width: 24 },
      'aria-label': '移除审批人',
    }),
  );
}

const isObjValue = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// 官方审批人值三态：数字/空 → 用户选择；{{...}} → 变量输入；filter 组 → 条件组面板（module 828 同款）
function renderAssigneeValue(item, onUpdate, disabled, usersCollection) {
  if (typeof item === 'string' && item.startsWith('{{')) {
    return React.createElement(OfficialVariableInput, { value: item, onChange: (v) => onUpdate(v), style: { width: '100%' } });
  }
  const group =
    isObjValue(item) && isUserFilterGroup(item.filter)
      ? item.filter
      : isUserFilterGroup(item)
        ? item
        : // 官方 FilterDynamicComponent onChange 输出编译格式（{$and:[...]}，空组为 {}）——
          // 交给面板的 toFilterGroup 反编译兜底，不能走 String() 分支（会显示 [object Object]）
          isObjValue(item)
          ? item
          : null;
  if (group) {
    return React.createElement(OfficialFilterPanel, {
      collection: usersCollection,
      initialValue: group,
      onChange: (next) => onUpdate(next ?? {}),
      style: { width: '100%' },
    });
  }
  const val = item == null ? '' : String(item);
  return CCUserSelect
    ? React.createElement(CCUserSelect, { value: val, onChange: (v) => onUpdate(v) })
    : React.createElement(UsersSelect, { value: val, onChange: (v) => onUpdate(v), disabled });
}

function AssigneesInput({ value: raw, onChange, disabled }) {
  const value = Array.isArray(raw) ? raw : [];
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const counter = React.useRef(0);
  const makeId = React.useCallback(() => `assignee-${counter.current++}`, []);
  const [ids, setIds] = React.useState(() => value.map(makeId));
  React.useEffect(() => {
    if (ids.length !== value.length) setIds(value.map(makeId));
  }, [value.length]);
  const rows = value.map((item, i) => ({ id: ids[i] ?? makeId(), item }));
  const sortDisabled = disabled || rows.length < 2;

  const update = (i, v) => {
    const norm = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
    onChange(value.map((x, xi) => (xi === i ? norm : x)));
  };
  const remove = (i) => {
    setIds((cur) => cur.filter((_, xi) => xi !== i));
    onChange(value.filter((_, xi) => xi !== i));
  };
  const add = (v) => {
    setIds((cur) => [...cur, makeId()]);
    onChange([...value, v]);
  };
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => String(r.id) === String(active.id));
    const to = rows.findIndex((r) => String(r.id) === String(over.id));
    if (from < 0 || to < 0) return;
    setIds((cur) => arrayMove(cur, from, to));
    onChange(arrayMove(value, from, to));
  };

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    rows.length
      ? React.createElement(
          DndContext,
          { sensors, collisionDetection: closestCenter, onDragEnd },
          React.createElement(
            SortableContext,
            { items: rows.map((r) => r.id), strategy: verticalListSortingStrategy },
            ...rows.map((r, i) =>
              React.createElement(AssigneeRow, {
                key: r.id,
                id: r.id,
                item: r.item,
                disabled,
                sortDisabled,
                onUpdate: (v) => update(i, v),
                onRemove: () => remove(i),
              }),
            ),
          ),
        )
      : null,
    React.createElement(
      Popover,
      {
        placement: 'bottom',
        trigger: 'hover',
        content: React.createElement(
          Space,
          { direction: 'vertical', size: 'small' },
          React.createElement(Button, { type: 'text', onClick: () => add('') }, '选择用户'),
          React.createElement(Button, { type: 'text', onClick: () => add(defaultUserFilterGroup()) }, '查询用户'),
        ),
      },
      React.createElement(Button, { block: true, disabled, icon: React.createElement(PlusOutlined), type: 'dashed' }, '添加'),
    ),
  );
}

function ApprovalNodeFieldset() {
  const form = Form.useFormInstance();
  const wf = useCurrentWorkflowContext?.() ?? {};
  const node = useNodeContext?.() ?? {};
  const collection = wf?.config?.collection;
  const branchMode = Form.useWatch(['config', 'branchMode'], form);
  const autoPass = !!(wf?.config?.autoPassIfApprovedInRound || wf?.config?.autoPassIfApplicant);
  const useSame = !!wf?.config?.useSameTaskTitle;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(Form.Item, { name: ['config', 'actions'], hidden: true }, React.createElement(Input)),
    React.createElement(
      Form.Item,
      { name: ['config', 'branchMode'], label: '通过模式', initialValue: false },
      React.createElement(
        Radio.Group,
        { disabled: true },
        React.createElement(Tooltip, { title: '拒绝或退回时立即结束流程。' }, React.createElement(Radio, { value: false }, '直通模式')),
        React.createElement(Tooltip, { title: '根据结果运行不同的分支。' }, React.createElement(Radio, { value: true }, '分支模式')),
      ),
    ),
    React.createElement(
      Form.Item,
      {
        name: ['config', 'assignees'],
        label: '审批人',
        required: true,
        rules: [
          {
            validator: (_, v) =>
              Array.isArray(v) && v.filter(Boolean).length > 0
                ? Promise.resolve()
                : Promise.reject(new Error('该字段值必填')),
          },
        ],
      },
      React.createElement(AssigneesInput),
    ),
    React.createElement(
      Form.Item,
      { name: ['config', 'negotiation'], label: '协商模式', initialValue: 0 },
      React.createElement(NegotiationRadio),
    ),
    React.createElement(
      Form.Item,
      { name: ['config', 'order'], label: '顺序', initialValue: false },
      React.createElement(
        Radio.Group,
        {},
        React.createElement(Tooltip, { title: '多个审批人可以按任意顺序审批。' }, React.createElement(Radio, { value: false }, '并行')),
        React.createElement(Tooltip, { title: '多个审批人按顺序依次审批。' }, React.createElement(Radio, { value: true }, '依次')),
      ),
    ),
    autoPass
      ? React.createElement(
          Form.Item,
          {
            name: ['config', 'forceManualApproval'],
            valuePropName: 'checked',
            initialValue: false,
            extra: '勾选后，即使审批触发器启用了自动通过，该节点也不会自动通过。',
          },
          React.createElement(Checkbox, null, '禁用自动通过'),
        )
      : null,
    branchMode
      ? React.createElement(
          Form.Item,
          {
            name: ['config', 'endOnReject'],
            valuePropName: 'checked',
            extra: '勾选后，拒绝分支结束时整个流程终止。',
          },
          React.createElement(Checkbox, null, '拒绝分支结束后结束流程'),
        )
      : null,
    // 批9 裁撤：审批界面（approvalUid）配置入口——AI portal 代替；存量 approvalUid
    // （flowModels 树）portal 读侧不受影响。
    // 批9：转签/加签候选人改用审批人同款 AssigneesInput——「选择用户」/「查询用户」
    // （条件组筛选）双通道，筛选范围命中的用户均可转签/加签（用户要求与审批人一致）；
    // 服务端 resolveAssigneeCandidates 已兼容 id / {filter} / 裸编译组三态。
    React.createElement(
      Form.Item,
      {
        name: ['config', 'toDelegateReassignees'],
        label: '转签候选人',
        extra: '「转签」弹窗中可选的审批人，与审批人同款选择器（可选用户或按条件查询）；留空表示该节点不可转签。',
      },
      React.createElement(AssigneesInput, null),
    ),
    React.createElement(
      Form.Item,
      {
        name: ['config', 'toAddReassignees'],
        label: '加签候选人',
        extra: '「加签」弹窗中可选的审批人，与审批人同款选择器（可选用户或按条件查询）；留空表示该节点不可加签。',
      },
      React.createElement(AssigneesInput, null),
    ),
    React.createElement(
      Form.Item,
      {
        label: '任务标题',
        extra: useSame
          ? '将使用审批触发器中设置的任务标题。'
          : '审批表中每个任务条目的标题，可以使用变量，默认为节点标题。',
      },
      React.createElement(
        Form.Item,
        { name: ['config', 'title'], initialValue: typeof node?.title === 'string' ? node.title : undefined, noStyle: true },
        React.createElement(VariableInput, { disabled: !!useSame }),
      ),
    ),
    // 官方节点 todo 组：待办分配时通知审批人（config.notifications，变量集 LY）
    React.createElement(NotificationList, {
      name: ['config', 'notifications'],
      type: NOTIFICATION_KIND.TODO,
      useVariables: useTodoTemplateVariables,
    }),
  );
}

// ------------------------------------------------------- canvas component

const BRANCH_META = {
  [-1]: { color: 'red', label: '拒绝' },
  2: { color: 'green', label: '通过' },
  1: { color: 'purple', label: '退回' },
};

function ApprovalCanvasComponent({ data }) {
  const flow = useFlowContext?.() ?? {};
  const nodes = flow?.nodes ?? [];
  const styles = useStyles?.()?.styles ?? {};
  // 官方（alpha.10 宿主）点卡片任意处打开配置抽屉；alpha.9 宿主只挂在本节点
  // 类型 chip 上。转发：排除输入类目标后，代点卡内第一个可点开的控件。
  const onCardClick = React.useCallback((e) => {
    const target = e.target;
    // 只读标题输入框不拦截（官方点卡任意处即开配置）；可交互控件仍走自身行为
    if (target.closest('input:not([disabled]):not([readonly]), textarea:not([disabled]), button, a, .anticon, [role="button"]')) return;
    const card = e.currentTarget;
    const opener = card.querySelector('.ant-tag, .ant-btn');
    if (opener) opener.click();
  }, []);
  if (!data?.config?.branchMode)
    return React.createElement(
      'div',
      { onClickCapture: onCardClick },
      React.createElement(NodeDefaultView, { data }),
    );
  return React.createElement(
    'div',
    { onClickCapture: onCardClick },
    React.createElement(
      NodeDefaultView,
      { data },
    React.createElement(
      'div',
      { className: styles.nodeSubtreeClass },
      React.createElement(
        'div',
        { className: styles.branchBlockClass },
        [-1, 2, 1].map((i) => {
          const meta = BRANCH_META[i];
          return React.createElement(Branch, {
            key: i,
            from: data,
            entry: nodes.find((n) => String(n.upstreamId) === String(data.id) && Number(n.branchIndex) === i),
            branchIndex: i,
            controller: React.createElement(
              'div',
              { className: 'nb-approval-branch-controller', style: { paddingTop: '1em' } },
              React.createElement(Tag, { color: meta.color }, meta.label),
            ),
            end: i === 1 || (i === -1 && !!data.config?.endOnReject),
          });
        }),
      ),
    ),
  ),
  );
}

module.exports = {
  ApprovalTriggerPresetFieldset,
  ApprovalTriggerFieldset,
  ApprovalTriggerTestFieldset,
  ApprovalNodePresetFieldset,
  ApprovalNodeFieldset,
  ApprovalCanvasComponent,
  makeUid,
};
