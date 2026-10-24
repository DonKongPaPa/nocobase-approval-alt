/**
 * registerApprovalCollections — ported 1:1 from the official main-bundle
 * module 334 (`q.k`): registers the approval client-side collection schemas
 * into the main data source so flow-engine blocks can resolve
 * approvals / approvalRecords / approvalExecutions / approvalMsgTpls /
 * approvalAudiences / approvalAudienceUsers, plus the hidden
 * workflows / flow_nodes summaries referenced by their relations.
 */
const { NS, MZ } = require('./shared');

const STATUS_ENUM = [
  { value: 0, label: `{{t("Draft", { ns: "${NS}" })}}`, editable: true, icon: 'EditOutlined' },
  { value: 1, label: `{{t("Returned", { ns: "${NS}" })}}`, color: 'purple', editable: true, icon: 'RollbackOutlined' },
  { value: 2, label: `{{t("Submitted", { ns: "${NS}" })}}`, color: 'cyan', icon: 'FileAddOutlined' },
  { value: 3, label: `{{t("Processing", { ns: "${NS}" })}}`, color: 'gold', icon: 'ClockCircleOutlined' },
  { value: 4, label: `{{t("Approved", { ns: "${NS}" })}}`, color: 'green', icon: 'CheckOutlined', terminated: true },
  { value: -1, label: `{{t("Rejected", { ns: "${NS}" })}}`, color: 'red', icon: 'CloseOutlined', terminated: true },
  { value: -2, label: `{{t("Workflow failed", { ns: "${NS}" })}}`, icon: 'ExclamationCircleOutlined', color: 'magenta', terminated: true },
  { value: -3, label: `{{t("Aborted", { ns: "${NS}" })}}`, icon: 'StopOutlined', color: 'volcano', terminated: true },
];

const RECORD_STATUS_ENUM = [
  { value: null, label: `{{t("Assigned", { ns: "${NS}" })}}`, color: 'blue', icon: 'HourglassOutlined' },
  { value: 0, label: `{{t("Pending", { ns: "${NS}" })}}`, color: 'gold', icon: 'ClockCircleOutlined' },
  { value: 1, label: `{{t("Returned", { ns: "${NS}" })}}`, color: 'purple', icon: 'RollbackOutlined' },
  { value: 2, label: `{{t("Approved", { ns: "${NS}" })}}`, color: 'green', icon: 'CheckOutlined' },
  { value: -1, label: `{{t("Rejected", { ns: "${NS}" })}}`, color: 'red', icon: 'CloseOutlined' },
  { value: -2, label: `{{t("Canceled", { ns: "${NS}" })}}`, icon: 'StopOutlined' },
  { value: -3, label: `{{t("Withdrawn", { ns: "${NS}" })}}`, icon: 'UndoOutlined' },
  { value: 3, label: `{{t("Unprocessed", { ns: "${NS}" })}}` },
  { value: 8, label: `{{t("Delegated", { ns: "${NS}" })}}`, color: 'geekblue', icon: 'ExportOutlined' },
  { value: 99, label: `{{t("Added", { ns: "${NS}" })}}`, icon: 'PlusOutlined' },
];

const workflowsSummary = {
  name: 'workflows',
  hidden: true,
  filterTargetKey: 'id',
  titleField: 'title',
  fields: [
    { type: 'snowflakeId', name: 'id', interface: 'id', uiSchema: { type: 'number', title: '{{t("ID")}}', 'x-component': 'InputNumber', 'x-read-pretty': true } },
    { type: 'string', name: 'title', interface: 'input', uiSchema: { title: '{{t("Name")}}', type: 'string', 'x-component': 'Input' } },
    { type: 'belongsTo', name: 'createdBy', target: 'users', foreignKey: 'createdById', interface: 'm2o', uiSchema: { type: 'number', title: '{{t("Created by")}}', 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { label: 'nickname', value: 'id' } } } },
  ],
};

const flowNodesSummary = {
  name: 'flow_nodes',
  hidden: true,
  filterTargetKey: 'id',
  titleField: 'title',
  fields: [
    { type: 'snowflakeId', name: 'id', interface: 'id', uiSchema: { type: 'number', title: '{{t("ID")}}', 'x-component': 'InputNumber', 'x-read-pretty': true } },
    { type: 'string', name: 'title', interface: 'input', uiSchema: { title: '{{t("Title")}}', type: 'string', 'x-component': 'Input' } },
  ],
};

const approvals = {
  migrationRules: ['schema-only'],
  title: MZ('Approval applications'),
  name: 'approvals',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false, interface: 'id', uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber' } },
    { type: 'string', name: 'collectionName' },
    { type: 'string', name: 'dataKey' },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId', onDelete: 'CASCADE', interface: 'm2o', isAssociation: true, uiSchema: { type: 'number', title: '{{t("Workflow", { ns: "workflow" })}}', 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { label: 'title', value: 'id' } } } },
    { type: 'string', name: 'workflowKey' },
    { type: 'belongsToMany', name: 'executions', target: 'executions', through: 'approvalExecutions', targetKey: 'id', sourceKey: 'id', foreignKey: 'approvalId', otherKey: 'executionId' },
    { type: 'hasMany', name: 'rounds', target: 'approvalExecutions', onDelete: 'CASCADE' },
    { type: 'belongsTo', name: 'latestRound', target: 'approvalExecutions', foreignKey: 'latestExecutionId' },
    { type: 'hasMany', name: 'records', target: 'approvalRecords', onDelete: 'CASCADE' },
    { type: 'integer', name: 'status', interface: 'select', uiSchema: { type: 'number', title: '{{t("Status", { ns: "workflow" })}}', 'x-component': 'Select', enum: STATUS_ENUM } },
    { type: 'json', name: 'data', defaultValue: {} },
    { type: 'belongsTo', name: 'applicantRole', foreignKey: 'applicantRoleName', target: 'roles' },
    { name: 'createdAt', type: 'date', interface: 'createdAt', uiSchema: { type: 'datetime', title: '{{t("Created at")}}', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } },
    { name: 'updatedAt', type: 'date', interface: 'updatedAt', uiSchema: { type: 'datetime', title: '{{t("Last updated at")}}', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } },
    { type: 'belongsTo', name: 'createdBy', target: 'users', foreignKey: 'createdById', interface: 'm2o', uiSchema: { type: 'number', title: MZ('Initiator'), 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { label: 'nickname', value: 'id' } } } },
    { type: 'jsonb', name: 'action', defaultValue: {} },
  ],
};

const approvalRecords = {
  migrationRules: ['schema-only'],
  title: MZ('Approval todos'),
  name: 'approvalRecords',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  createdAt: true,
  updatedAt: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false, interface: 'id', uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber' } },
    { type: 'belongsTo', name: 'approval', target: 'approvals', foreignKey: 'approvalId', interface: 'm2o', isAssociation: true, onDelete: 'CASCADE', uiSchema: { type: 'object', title: MZ('Belonged approval'), 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { value: 'id', label: 'id' }, ellipsis: true } } },
    { type: 'belongsTo', name: 'approvalExecution' },
    { type: 'belongsTo', name: 'user', target: 'users', foreignKey: 'userId', onDelete: 'NO ACTION', interface: 'm2o', isAssociation: true, uiSchema: { type: 'number', title: MZ('Assignee'), 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { value: 'id', label: 'nickname' } } } },
    { type: 'belongsTo', name: 'job', target: 'jobs', onDelete: 'CASCADE' },
    { type: 'belongsTo', name: 'execution' },
    { type: 'belongsTo', name: 'node', target: 'flow_nodes', foreignKey: 'nodeId', uiSchema: { title: MZ('Approve node') } },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId', interface: 'm2o', isAssociation: true, uiSchema: { type: 'number', title: '{{t("Workflow", { ns: "workflow" })}}', 'x-component': 'AssociationField', 'x-component-props': { fieldNames: { label: 'title', value: 'id' } } } },
    { type: 'integer', name: 'index' },
    { type: 'string', name: 'title', interface: 'input', uiSchema: { type: 'string', title: MZ('Task title'), 'x-component': 'Input' } },
    { type: 'integer', name: 'status', interface: 'select', uiSchema: { type: 'number', title: '{{t("Status", { ns: "workflow" })}}', 'x-component': 'Select', enum: RECORD_STATUS_ENUM } },
    { type: 'text', name: 'comment', interface: 'textarea', uiSchema: { type: 'string', 'x-component': 'Input.TextArea', title: MZ('Comment'), default: '' } },
    { type: 'string', name: 'returnToNodeKey' },
    { name: 'createdAt', type: 'date', interface: 'createdAt', uiSchema: { type: 'string', title: '{{t("Created at")}}', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } },
    { name: 'updatedAt', type: 'date', interface: 'updatedAt', uiSchema: { type: 'string', title: '{{t("Last updated at")}}', 'x-component': 'DatePicker', 'x-component-props': { showTime: true } } },
    { type: 'string', name: 'type' },
    { type: 'belongsTo', name: 'prevRecord', target: 'approvalRecords' },
    { type: 'json', name: 'dataBefore' },
    { type: 'json', name: 'dataAfter' },
    { type: 'json', name: 'changes' },
  ],
  indexes: [{ fields: ['jobId', 'index'], unique: true }, { fields: ['userId', 'status'] }],
};

const approvalExecutions = {
  migrationRules: ['schema-only'],
  title: MZ('Approval executions'),
  name: 'approvalExecutions',
  dataCategory: 'business',
  filterTargetKey: 'id',
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false, interface: 'id', uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber' } },
    { type: 'belongsTo', name: 'approval', foreignKey: 'approvalId', primaryKey: false },
    { type: 'bigInt', name: 'approvalId', interface: 'number', uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber' } },
    { type: 'belongsTo', name: 'execution', foreignKey: 'executionId', primaryKey: false },
    { type: 'bigInt', name: 'executionId', interface: 'number', uiSchema: { type: 'number', title: 'ID', 'x-component': 'InputNumber' } },
    { type: 'integer', name: 'status' },
    { type: 'string', name: 'reason', uiSchema: { type: 'string', title: MZ('Execution reason'), 'x-component': 'Select', 'x-decorator': 'FormItem', enum: '{{ExecutionReasonOptions}}' } },
    { type: 'jsonb', name: 'snapshot' },
    { type: 'hasMany', name: 'records', target: 'approvalRecords' },
  ],
};

const approvalMsgTpls = {
  migrationRules: ['overwrite'],
  name: 'approvalMsgTpls',
  dataCategory: 'business',
  filterTargetKey: 'id',
  fields: [
    { name: 'id', type: 'snowflakeId', primaryKey: true, allowNull: false },
    { type: 'string', name: 'notificationType', interface: 'select', uiSchema: { type: 'string', title: MZ('Channel type'), 'x-component': 'Select', enum: '{{notificationTypeOptions}}', required: true } },
    { type: 'string', name: 'title', interface: 'input', uiSchema: { type: 'string', title: MZ('Template title'), 'x-component': 'Input', required: true } },
    { type: 'string', name: 'type', interface: 'select', uiSchema: { type: 'string', title: MZ('Message type'), 'x-component': 'Select', 'x-component-props': { optionRender: '{{MessageTypeOptionRender}}' }, enum: [
      { label: MZ('To do'), value: 'todo', color: 'gold', description: MZ('Notify approver when task starts.') },
      { label: MZ('Done'), value: 'done', color: 'blue', description: MZ('Notify applicant when approval is approved, rejected or returned.') },
    ], required: true, default: 'todo' } },
    { type: 'json', name: 'template', default: {} },
  ],
};

const approvalAudiences = {
  migrationRules: ['overwrite', 'schema-only'],
  name: 'approvalAudiences',
  dataCategory: 'business',
  createdAt: true,
  updatedAt: true,
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId', onDelete: 'CASCADE' },
    { type: 'string', name: 'type', allowNull: false },
    { type: 'string', name: 'targetKey', allowNull: false },
  ],
  indexes: [{ fields: ['workflowId', 'type', 'targetKey'] }],
};

const approvalAudienceUsers = {
  migrationRules: ['schema-only'],
  name: 'approvalAudienceUsers',
  dataCategory: 'business',
  fields: [
    { type: 'snowflakeId', name: 'id', primaryKey: true, allowNull: false },
    { type: 'belongsTo', name: 'workflow', target: 'workflows', foreignKey: 'workflowId', onDelete: 'CASCADE' },
    { type: 'belongsTo', name: 'user', target: 'users', foreignKey: 'userId', onDelete: 'CASCADE' },
  ],
  indexes: [{ fields: ['workflowId', 'userId'], unique: true }],
};

const COLLECTIONS = [
  workflowsSummary,
  flowNodesSummary,
  approvals,
  approvalRecords,
  approvalExecutions,
  approvalMsgTpls,
  approvalAudiences,
  approvalAudienceUsers,
];

/** Official module 334 `u`: register missing collections into the main data source. */
export function registerApprovalCollections(flowEngine) {
  if (!flowEngine) return false;
  let dataSource;
  try {
    dataSource = flowEngine.context.dataSourceManager.getDataSource('main');
  } catch (e) {
    return false;
  }
  if (!dataSource) return false;
  let added = 0;
  COLLECTIONS.forEach((schema) => {
    if (!dataSource.getCollection(schema.name)) {
      dataSource.addCollection({ ...schema, hidden: true });
      added += 1;
    }
  });
  return added > 0;
}

/** Official handleDataSourceLoaded: re-run when the main data source loads. */
export function bindDataSourceLoaded(plugin, flowEngine) {
  const handler = (info) => {
    const key = info?.detail?.dataSourceKey;
    if (key === 'main' || key === '*') {
      registerApprovalCollections(flowEngine);
    }
  };
  try {
    plugin.app.eventBus?.addEventListener?.('dataSource:loaded', handler);
  } catch (e) {
    /* event bus not ready */
  }
}

export default registerApprovalCollections;
