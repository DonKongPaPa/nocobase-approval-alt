/**
 * Client of the compatible workflow-approval implementation.
 * Registers: trigger "approval", instruction "approval", task types
 * "approval-apply" / "approval-todos" into the workflow task center.
 */
const React = require('react');
const {
  Plugin: NocoBasePlugin,
  useAPIClient,
  useCollectionRecordData,
  usePopupRecordContext,
  SchemaComponent,
  useApp,
} = require('@nocobase/client');
const { useNavigate } = require('react-router-dom');
const { Button, Tag, Drawer, Input, Space, Select, Modal, message, Popconfirm, Descriptions, Card, List, Radio, InputNumber, Checkbox } = require('antd');
const { Plugin: WorkflowClient, Trigger, Instruction } = require('@nocobase/plugin-workflow/client');
const { useRequest } = require('ahooks');

const STATUS_TAG = {
  0: ['gold', 'Draft'],
  1: ['purple', 'Returned'],
  2: ['cyan', 'Submitted'],
  3: ['geekblue', 'Processing'],
  4: ['green', 'Approved'],
  [-1]: ['red', 'Rejected'],
  [-2]: ['red', 'Failed'],
  [-3]: ['default', 'Aborted'],
};
const RECORD_TAG = {
  0: ['gold', 'Pending'],
  1: ['purple', 'Returned'],
  2: ['green', 'Approved'],
  3: ['default', 'Unprocessed'],
  4: ['green', 'Passed'],
  8: ['geekblue', 'Delegated'],
  [-1]: ['red', 'Rejected'],
  [-2]: ['default', 'Canceled'],
  [-3]: ['default', 'Withdrawn'],
  99: ['blue', 'Added'],
};

function StatusTag({ value, map }) {
  const [color, label] = map[value] ?? ['default', String(value)];
  return React.createElement(Tag, { color }, label);
}

// ------------------------------------------------------------------ trigger

class ApprovalTrigger extends Trigger {
  title = '{{t("Approval event")}}';
  fieldset = {
    collection: {
      type: 'string',
      title: '{{t("Collection")}}',
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'ApprovalCollectionSelector',
    },
    mode: {
      type: 'number',
      title: '{{t("Trigger mode")}}',
      default: 0,
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: 0, label: 'Before data saved' },
        { value: 1, label: 'After data saved' },
      ],
    },
    centralized: {
      type: 'boolean',
      title: 'Initiation scope',
      default: true,
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: false, label: 'Initiate in data blocks only' },
        { value: true, label: 'In both data blocks and to-do center' },
      ],
    },
    withdrawable: {
      type: 'boolean',
      title: 'Withdrawable',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    },
    recordShowMode: {
      type: 'boolean',
      title: 'Record show mode',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: false, label: 'Snapshot' },
        { value: true, label: 'Latest' },
      ],
    },
    autoPassIfApplicant: {
      type: 'boolean',
      title: 'Auto pass if approver is applicant',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    },
    autoPassIfApprovedInRound: {
      type: 'boolean',
      title: 'Auto pass if approver has already approved in current round',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    },
  };

  scope = {
    useApprovedCollections() {
      const api = useAPIClient();
      const { data } = useRequest(() =>
        api.resource('collections').list({ filter: { hidden: false }, paginate: false }),
      );
      return (data?.data ?? []).map((c) => ({ value: c.name, label: c.title || c.name }));
    },
  };

  components = {
    ApprovalCollectionSelector: (props) => {
      const options = this.scope.useApprovedCollections();
      return React.createElement(Select, { ...props, options, showSearch: true });
    },
  };

  createDefaultConfig() {
    return { collection: null, mode: 0, appends: [], centralized: true, audienceType: 1 };
  }
}

// --------------------------------------------------------------- instruction

const ACTION_OPTIONS = [
  { value: 2, label: 'Approve' },
  { value: -1, label: 'Reject' },
  { value: 1, label: 'Return' },
  { value: 8, label: 'Delegate' },
  { value: 99, label: 'Add assignee' },
];

class ApprovalInstructionX extends Instruction {
  title = '{{t("Approval node")}}';
  fieldset = {
    assignees: {
      type: 'array',
      title: 'Assignees',
      required: true,
      default: [],
      'x-decorator': 'FormItem',
      'x-component': 'ApprovalAssigneesEditor',
      description: 'Users, {{$context...}} variables, or {"filter":{}} query — flattened into one approver set.',
    },
    negotiation: {
      type: 'number',
      title: 'Negotiation mode',
      default: 0,
      'x-decorator': 'FormItem',
      'x-component': 'ApprovalNegotiation',
    },
    order: {
      type: 'boolean',
      title: 'Multiple approvers in sequential order',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    },
    branchMode: {
      type: 'boolean',
      title: 'Pass mode',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Radio.Group',
      enum: [
        { value: false, label: 'Passthrough mode' },
        { value: true, label: 'Branch mode' },
      ],
    },
    endOnReject: {
      type: 'boolean',
      title: 'End the workflow after rejection branch',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
      'x-reactions': {
        dependencies: ['branchMode'],
        fulfill: { state: { visible: '{{$deps[0] === true}}' } },
      },
    },
    actions: {
      type: 'array',
      title: 'Actions settings',
      default: [2, -1, 1, 8, 99],
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox.Group',
      enum: ACTION_OPTIONS,
    },
    forceManualApproval: {
      type: 'boolean',
      title: 'Disable auto pass',
      default: false,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox',
    },
  };

  scope = {
    useUserOptions() {
      const api = useAPIClient();
      const [kw, setKw] = React.useState('');
      const { data } = useRequest(
        () =>
          api.resource('users').list({
            pageSize: 50,
            filter: kw ? { $or: [{ nickname: { $includes: kw } }, { username: { $includes: kw } }] } : {},
          }),
        { refreshDeps: [kw], debounceWait: 300 },
      );
      return {
        options: (data?.data ?? []).map((u) => ({ value: u.id, label: u.nickname || u.username })),
        onSearch: setKw,
      };
    },
  };

  components = {
    ApprovalAssigneesEditor: (props) => {
      const { value = [], onChange } = props;
      const { options, onSearch } = this.scope.useUserOptions();
      const rows = Array.isArray(value) ? value : [];
      const update = (next) => onChange(next);
      const addUser = (uid) => {
        if (uid == null) return;
        update([...rows, Number(uid)]);
      };
      const addFilter = () => {
        update([...rows, { filter: { id: null } }]);
      };
      const addVariable = () => {
        update([...rows, '{{$context.data.id}}']);
      };
      const setRow = (i, v) => {
        const next = [...rows];
        next[i] = v;
        update(next);
      };
      const removeRow = (i) => {
        update(rows.filter((_, x) => x !== i));
      };
      return React.createElement(
        'div',
        {},
        React.createElement(
          Select,
          {
            key: 'add',
            showSearch: true,
            placeholder: 'Add assignees (users)',
            options,
            onSearch,
            value: null,
            onChange: addUser,
            style: { width: '100%', marginBottom: 8 },
          },
        ),
        rows.map((row, i) =>
          React.createElement(
            Space,
            { key: i, style: { display: 'flex', marginBottom: 4 } },
            typeof row === 'object' && row !== null && row.filter
              ? React.createElement(Input, {
                  value: JSON.stringify(row.filter),
                  onChange: (e) => {
                    try {
                      setRow(i, { filter: JSON.parse(e.target.value || '{}') });
                    } catch (err) {
                      /* ignore mid-typing */
                    }
                  },
                  style: { minWidth: 280 },
                  placeholder: '{"filter": {...}}',
                })
              : typeof row === 'string'
                ? React.createElement(Input, {
                    value: row,
                    onChange: (e) => setRow(i, e.target.value),
                    style: { minWidth: 280 },
                    placeholder: '{{$context.data.xxx}}',
                  })
                : React.createElement(Select, {
                    value: row,
                    options,
                    onSearch,
                    showSearch: true,
                    onChange: (v) => setRow(i, Number(v)),
                    style: { minWidth: 200 },
                  }),
            React.createElement(
              Button,
              { size: 'small', onClick: () => removeRow(i) },
              '×',
            ),
          ),
        ),
        React.createElement(
          Space,
          { key: 'more', style: { marginTop: 8 } },
          React.createElement(Button, { size: 'small', onClick: addFilter }, '+ Query users'),
          React.createElement(Button, { size: 'small', onClick: addVariable }, '+ Variable'),
        ),
      );
    },
    ApprovalNegotiation: (props) => {
      const { value = 0, onChange } = props;
      const isVoting = typeof value === 'number' && value > 0 && value < 1;
      const kind = isVoting ? 'voting' : String(value);
      return React.createElement(
        'div',
        {},
        React.createElement(Radio.Group, {
          value: kind,
          options: [
            { value: '0', label: 'Or (any decides)' },
            { value: '1', label: 'And (all must approve)' },
            { value: 'voting', label: 'Voting' },
          ],
          onChange: (e) => {
            const v = e.target.value;
            onChange(v === 'voting' ? 0.5 : Number(v));
          },
        }),
        isVoting
          ? React.createElement(
              'div',
              { style: { marginTop: 4 } },
              '> ',
              React.createElement(InputNumber, {
                min: 1,
                max: 99,
                value: Math.round(value * 100),
                onChange: (p) => onChange(Number(p) > 0 && Number(p) < 100 ? Number(p) / 100 : 0.5),
                addonAfter: '%',
                style: { width: 160 },
              }),
            )
          : null,
      );
    },
  };
}

// ------------------------------------------------------------------ helpers

function useApprovalDetail(record, kind) {
  const api = useAPIClient();
  const { data, loading, refresh } = useRequest(async () => {
    if (!record?.id) return null;
    if (kind === 'todos') {
      const res = await api.resource('approvalRecords').get({ filterByTk: record.id });
      return res?.data?.data ?? null;
    }
    const res = await api.resource('approvals').get({ filterByTk: record.id });
    return res?.data?.data ?? null;
  }, { refreshDeps: [record?.id] });
  return { detail: data, loading, refresh };
}

function UserInfo({ user }) {
  if (!user) return null;
  return React.createElement('span', {}, user.nickname || user.username || `#${user.id}`);
}

// ------------------------------------------------------------ task: apply

function ApplyItem() {
  const record = useCollectionRecordData();
  const setRecord = usePopupRecordContext().setRecord;
  const navigate = useNavigate();
  return React.createElement(
    Card,
    {
      size: 'small',
      style: { cursor: 'pointer', marginBottom: 8 },
      onClick: () => {
        setRecord(record);
        navigate(`./${record.id}`);
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between' } },
      React.createElement('b', {}, record.workflow?.title ?? record.workflowKey ?? ''),
      React.createElement(StatusTag, { value: record.status, map: STATUS_TAG }),
    ),
    React.createElement(
      'div',
      {},
      `#${record.dataKey ?? ''} · ${String(record.createdAt ?? '').slice(0, 19).replace('T', ' ')}`,
    ),
  );
}

function ApplyDetail() {
  const record = useCollectionRecordData();
  const api = useAPIClient();
  const { detail, refresh } = useApprovalDetail(record, 'apply');
  if (!detail) return null;
  const canWithdraw = detail.status === 2 && detail.workflow?.config?.withdrawable;
  const canDelete = detail.status === 0;
  const doWithdraw = async () => {
    await api.resource('approvals').withdraw({ filterByTk: detail.id });
    message.success('Withdrawn');
    refresh();
  };
  const doDelete = async () => {
    await api.resource('approvals').destroy({ filterByTk: detail.id });
    message.success('Deleted');
    refresh();
  };
  return React.createElement(
    'div',
    {},
    React.createElement(Descriptions, {
      size: 'small',
      column: 1,
      bordered: true,
      items: [
        { key: 'st', label: 'Status', children: React.createElement(StatusTag, { value: detail.status, map: STATUS_TAG }) },
        { key: 'wf', label: 'Workflow', children: detail.workflow?.title ?? detail.workflowKey },
        { key: 'by', label: 'Applicant', children: React.createElement(UserInfo, { user: detail.createdBy }) },
        { key: 'at', label: 'Created at', children: String(detail.createdAt ?? '').slice(0, 19).replace('T', ' ') },
        { key: 'key', label: 'Record ID', children: detail.dataKey },
      ],
    }),
    React.createElement(
      'div',
      { style: { marginTop: 16, display: 'flex', gap: 8 } },
      canWithdraw
        ? React.createElement(
            Popconfirm,
            { title: 'Are you sure you want to withdraw it?', onConfirm: doWithdraw },
            React.createElement(Button, {}, 'Withdraw'),
          )
        : null,
      canDelete
        ? React.createElement(
            Popconfirm,
            { title: 'Delete this draft?', onConfirm: doDelete },
            React.createElement(Button, { danger: true }, 'Delete'),
          )
        : null,
    ),
  );
}

// ------------------------------------------------------------ task: todos

function TodosItem() {
  const record = useCollectionRecordData();
  const setRecord = usePopupRecordContext().setRecord;
  const navigate = useNavigate();
  return React.createElement(
    Card,
    {
      size: 'small',
      style: { cursor: 'pointer', marginBottom: 8 },
      onClick: () => {
        setRecord(record);
        navigate(`./${record.id}`);
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between' } },
      React.createElement('b', {}, record.title ?? ''),
      React.createElement(StatusTag, { value: record.status, map: RECORD_TAG }),
    ),
    React.createElement(
      'div',
      {},
      `approval #${record.approvalId} · node #${record.nodeId}`,
    ),
  );
}

function ActionButtons({ detail, refresh }) {
  const api = useAPIClient();
  const [comment, setComment] = React.useState('');
  const recordId = detail?.id;
  if (!detail || detail.status !== 0) return null;
  const act = async (action, values) => {
    try {
      await api.resource('approvalRecords')[action]({ filterByTk: recordId, values });
      message.success('Submitted');
      setComment('');
      refresh();
    } catch (e) {
      message.error(e?.response?.data?.errors?.[0]?.message ?? 'Submitted failed');
    }
  };
  const withData = (extra) => ({ comment: comment || undefined, data: {}, ...extra });
  const nodeConfig = detail.node?.config ?? {};
  const actions = nodeConfig.actions ?? [2, -1, 1, 8, 99];
  const buttons = [];
  if (actions.includes(2)) {
    buttons.push(
      React.createElement(Button, { key: 'ok', type: 'primary', onClick: () => act('submit', withData({ status: 2 })) }, 'Approve'),
    );
  }
  if (actions.includes(-1)) {
    buttons.push(
      React.createElement(Button, { key: 'rej', danger: true, onClick: () => act('submit', withData({ status: -1 })) }, 'Reject'),
    );
  }
  if (actions.includes(1)) {
    const upstream = (detail.workflow?.nodes ?? []).filter(
      (n) => n.type === 'approval' && String(n.id) !== String(detail.nodeId),
    );
    const doReturn = (returnToNodeKey) => act('return', withData({ status: 1, returnToNodeKey }));
    buttons.push(
      upstream.length
        ? React.createElement(
            Button,
            {
              key: 'ret',
              onClick: () => {
                Modal.info({
                  title: 'Return',
                  content: React.createElement(
                    'div',
                    {},
                    upstream.map((n) =>
                      React.createElement(
                        Button,
                        {
                          key: n.id,
                          block: true,
                          style: { marginTop: 4 },
                          onClick: () => {
                            Modal.destroyAll();
                            doReturn(n.key);
                          },
                        },
                        `Return to: ${n.title}`,
                      ),
                    ),
                  ),
                  onOk: () => {},
                });
              },
            },
            'Return',
          )
        : React.createElement(Button, { key: 'ret', onClick: () => doReturn(undefined) }, 'Return'),
    );
  }
  const reassign = (type) => {
    let selected;
    Modal.confirm({
      title: type === 'delegate' ? 'Delegate to' : 'Add assignees',
      content: React.createElement(ReassigneeSelect, {
        recordId,
        type,
        onChange: (v) => {
          selected = v;
        },
      }),
      onOk: async () => {
        if (type === 'delegate') {
          await act('delegate', { assignee: Number(selected) });
        } else {
          await act('add', { assignee: (Array.isArray(selected) ? selected : [selected]).map(Number), order: 1 });
        }
      },
    });
  };
  if (actions.includes(8)) buttons.push(React.createElement(Button, { key: 'dlg', onClick: () => reassign('delegate') }, 'Delegate'));
  if (actions.includes(99)) buttons.push(React.createElement(Button, { key: 'add', onClick: () => reassign('add') }, 'Add assignee'));
  return React.createElement(
    'div',
    {},
    React.createElement(Input.TextArea, {
      value: comment,
      onChange: (e) => setComment(e.target.value),
      placeholder: 'Comment',
      style: { marginBottom: 8 },
    }),
    React.createElement(Space, { wrap: true }, buttons),
  );
}

function ReassigneeSelect({ recordId, type, onChange }) {
  const api = useAPIClient();
  const [options, setOptions] = React.useState([]);
  React.useEffect(() => {
    api
      .request({
        url: `approvalRecords/${recordId}/reassignees:list`,
        params: { type, pageSize: 200 },
      })
      .then((res) => {
        setOptions((res?.data?.data ?? []).map((u) => ({ value: u.id, label: u.nickname || u.username })));
      });
  }, [recordId, type]);
  return React.createElement(Select, {
    mode: type === 'add' ? 'multiple' : undefined,
    options,
    style: { width: '100%', minWidth: 260 },
    placeholder: 'Select assignees',
    onChange: (v) => onChange(v),
  });
}

function TodosDetail() {
  const record = useCollectionRecordData();
  const { detail, refresh } = useApprovalDetail(record, 'todos');
  if (!detail) return null;
  const approval = detail.approval ?? {};
  const records = approval.records ?? [];
  return React.createElement(
    'div',
    {},
    React.createElement(Descriptions, {
      size: 'small',
      column: 1,
      bordered: true,
      items: [
        { key: 'node', label: 'Node', children: detail.node?.title ?? detail.nodeId },
        { key: 'st', label: 'Status', children: React.createElement(StatusTag, { value: detail.status, map: RECORD_TAG }) },
        { key: 'wf', label: 'Workflow', children: approval.workflow?.title ?? detail.workflowId },
        { key: 'by', label: 'Applicant', children: React.createElement(UserInfo, { user: approval.createdBy }) },
        { key: 'data', label: 'Application', children: React.createElement('code', { style: { fontSize: 12 } }, JSON.stringify(approval.data ?? {}).slice(0, 500)) },
        detail.comment ? { key: 'cm', label: 'Comment', children: String(detail.comment) } : null,
      ].filter(Boolean),
    }),
    React.createElement(
      'div',
      { style: { margin: '12px 0' } },
      React.createElement('h4', {}, 'Approval records'),
      React.createElement(
        List,
        {
          size: 'small',
          dataSource: records,
          renderItem: (r) =>
            React.createElement(
              List.Item,
              {},
              React.createElement(
                'span',
                {},
                `#${r.index ?? ''} `,
                React.createElement(UserInfo, { user: r.user }),
                ` (${r.type ?? 'Normal'})`,
              ),
              React.createElement(StatusTag, { value: r.status, map: RECORD_TAG }),
            ),
        },
      ),
    ),
    React.createElement(ActionButtons, { detail, refresh }),
  );
}

// --------------------------------------------------------------- task types

const applyTaskType = {
  key: 'approval-apply',
  title: '{{t("My applications")}}',
  collection: 'approvals',
  action: 'listMine',
  useActionParams: (status) => {
    const map = {
      pending: { status: [0, 1, 2, 3] },
      completed: { status: [4, -1, -2, -3] },
      all: {},
    };
    return {
      filter: map[status] ?? {},
      sort: ['-id'],
      appends: ['workflow.title', 'createdBy'],
    };
  },
  Item: ApplyItem,
  Detail: ApplyDetail,
  getPopupRecord: (api, { params }) =>
    api.resource('approvals').get({ filterByTk: params.filterByTk }),
};

const todosTaskType = {
  key: 'approval-todos',
  title: '{{t("My approvals")}}',
  collection: 'approvalRecords',
  action: 'listMine',
  useActionParams: (status) => {
    const map = {
      pending: { status: 0, 'approval.status': [2, 3] },
      completed: { status: [-1, 1, 2] },
      all: {},
    };
    return {
      filter: map[status] ?? {},
      sort: ['-id'],
      appends: ['node.title', 'workflow.title', 'approval'],
    };
  },
  Item: TodosItem,
  Detail: TodosDetail,
  getPopupRecord: (api, { params }) =>
    api.resource('approvalRecords').get({ filterByTk: params.filterByTk }),
};

// -------------------------------------------------------------------- plugin

class PluginApprovalClient extends WorkflowClient {
  async afterAdd() {
    this.app.addComponents({
      ApprovalCollectionSelector: ApprovalTrigger.prototype.components.ApprovalCollectionSelector,
    });
    const workflow = this.app.pm.get('workflow');
    workflow?.registerTrigger?.('approval', ApprovalTrigger);
    workflow?.registerInstruction?.('approval', ApprovalInstructionX);
    workflow?.registerTaskType?.('approval-apply', applyTaskType);
    workflow?.registerTaskType?.('approval-todos', todosTaskType);
  }
}

module.exports = PluginApprovalClient;
module.exports.default = PluginApprovalClient;
