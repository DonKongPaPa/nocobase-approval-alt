/**
 * Shared constants & helpers for the replicated official private model classes.
 * Ported 1:1 from the official approval client-v2 bundle:
 *   - module 358  : NS / statuses / metadata maps
 *   - module 9488 : MZ (tExpr), kj (flow-context translator)
 *   - helpers used across chunk 502/654/733 (virtual "data" field resolution)
 */
const React = require('react');

// module 358 -------------------------------------------------------------
const NS = '@nocobase/plugin-workflow-approval';

const APPROVAL_STATUS = {
  DRAFT: 0,
  RETURNED: 1,
  SUBMITTED: 2,
  PROCESSING: 3,
  APPROVED: 4,
  REJECTED: -1,
  FAILED: -2,
  ABORTED: -3,
};

const RECORD_STATUS = {
  ASSIGNED: null,
  PENDING: 0,
  RETURNED: 1,
  APPROVED: 2,
  UNPROCESSED: 3,
  PASSED: 4,
  DELEGATED: 8,
  REJECTED: -1,
  CANCELED: -2,
  WITHDRAWN: -3,
  ADDED: 99,
};

const RECORD_TYPE = {
  REJECTED: RECORD_STATUS.REJECTED,
  RETURNED: RECORD_STATUS.RETURNED,
  APPROVED: RECORD_STATUS.APPROVED,
  DELEGATED: RECORD_STATUS.DELEGATED,
  ADDED: RECORD_STATUS.ADDED,
};

const NOTIFICATION_KIND = { TODO: 'todo', DONE: 'done' };
const TEMPLATE_TYPE = { CUSTOM: 'custom', TEMPLATE: 'template' };
const RETURN_TYPE = { ANY: 'any', COUNT: 'count', SPECIFIC: 'specific', START: 'start' };

const RETURN_NODE_OPTIONS = [
  { value: RETURN_TYPE.ANY, label: `{{t("Any previous approval node", { ns: "${NS}" })}}` },
  { value: RETURN_TYPE.COUNT, label: `{{t("Previous N approval nodes", { ns: "${NS}" })}}` },
  { value: RETURN_TYPE.SPECIFIC, label: `{{t("Only specific approval node", { ns: "${NS}" })}}` },
  { value: RETURN_TYPE.START, label: `{{t("Applicant (restart)", { ns: "${NS}" })}}` },
];

const APPROVAL_STATUS_LIST = [
  { value: APPROVAL_STATUS.DRAFT, label: `{{t("Draft", { ns: "${NS}" })}}`, editable: true, icon: 'EditOutlined' },
  { value: APPROVAL_STATUS.RETURNED, label: `{{t("Returned", { ns: "${NS}" })}}`, color: 'purple', editable: true, icon: 'RollbackOutlined' },
  { value: APPROVAL_STATUS.SUBMITTED, label: `{{t("Submitted", { ns: "${NS}" })}}`, color: 'cyan', icon: 'FileAddOutlined' },
  { value: APPROVAL_STATUS.PROCESSING, label: `{{t("Processing", { ns: "${NS}" })}}`, color: 'gold', icon: 'ClockCircleOutlined' },
  { value: APPROVAL_STATUS.APPROVED, label: `{{t("Approved", { ns: "${NS}" })}}`, color: 'green', icon: 'CheckOutlined', terminated: true },
  { value: APPROVAL_STATUS.REJECTED, label: `{{t("Rejected", { ns: "${NS}" })}}`, color: 'red', icon: 'CloseOutlined', terminated: true },
  { value: APPROVAL_STATUS.FAILED, label: `{{t("Workflow failed", { ns: "${NS}" })}}`, icon: 'ExclamationCircleOutlined', color: 'magenta', terminated: true },
  { value: APPROVAL_STATUS.ABORTED, label: `{{t("Aborted", { ns: "${NS}" })}}`, icon: 'StopOutlined', color: 'volcano', terminated: true },
];

const APPROVAL_STATUS_META = APPROVAL_STATUS_LIST.reduce((acc, item) => Object.assign(acc, { [item.value]: item }), {});

const RECORD_STATUS_LIST = [
  { value: RECORD_STATUS.ASSIGNED, label: `{{t("Assigned", { ns: "${NS}" })}}`, color: 'blue', icon: 'HourglassOutlined' },
  { value: RECORD_STATUS.PENDING, label: `{{t("Pending", { ns: "${NS}" })}}`, color: 'gold', icon: 'ClockCircleOutlined' },
  { value: RECORD_STATUS.RETURNED, label: `{{t("Returned", { ns: "${NS}" })}}`, color: 'purple', icon: 'RollbackOutlined' },
  { value: RECORD_STATUS.APPROVED, label: `{{t("Approved", { ns: "${NS}" })}}`, color: 'green', icon: 'CheckOutlined' },
  { value: RECORD_STATUS.REJECTED, label: `{{t("Rejected", { ns: "${NS}" })}}`, color: 'red', icon: 'CloseOutlined' },
  { value: RECORD_STATUS.CANCELED, label: `{{t("Canceled", { ns: "${NS}" })}}`, icon: 'StopOutlined' },
  { value: RECORD_STATUS.WITHDRAWN, label: `{{t("Withdrawn", { ns: "${NS}" })}}`, icon: 'UndoOutlined' },
  { value: RECORD_STATUS.UNPROCESSED, label: `{{t("Unprocessed", { ns: "${NS}" })}}` },
  { value: RECORD_STATUS.DELEGATED, label: `{{t("Delegated", { ns: "${NS}" })}}`, color: 'geekblue', icon: 'ExportOutlined' },
  { value: RECORD_STATUS.ADDED, label: `{{t("Added", { ns: "${NS}" })}}`, icon: 'PlusOutlined' },
];

const RECORD_STATUS_META = RECORD_STATUS_LIST.reduce((acc, item) => Object.assign(acc, { [item.value]: item }), {});

const TASK_TYPE_APPLY = 'approval-apply';
const TASK_TYPE_TODOS = 'approval-todos';

const HIDE_APPLY_FORM_DELETE_ACTION = '__workflowApprovalHideApplyFormDeleteAction';

// module 9488 ------------------------------------------------------------
/** tExpr: produces the official `{{t("...", { ns })}}` template string. */
function MZ(text) {
  return `{{t(${JSON.stringify(text)}, { ns: "${NS}" })}}`;
}

/** Translate label template (or plain string) through the flow engine context. */
function translateLabel(engine, label, options) {
  if (typeof label !== 'string') return label;
  const t = engine?.context?.t;
  if (typeof t !== 'function') return label;
  const match = label.match(/^\{\{t\(["'](.+?)["']/);
  return t(match ? match[1] : label, { ns: NS, ...(options ?? {}) });
}

// generic helpers ---------------------------------------------------------
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function toStringValue(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function strOrEmpty(v) {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function compact(list) {
  return Array.isArray(list) ? list.filter(Boolean) : list ? [list] : [];
}

function groupHasChildren(item) {
  return Array.isArray(item.children) && item.children.length > 0;
}

/** parse "ds:collection" / "collection" / "ds.collection" -> [dataSourceKey, collectionName] */
function splitCollectionName(value) {
  if (!value) return [];
  const parts = value.split(':');
  const name = parts.pop();
  const ds = parts[0] ?? 'main';
  return name ? [ds, name] : [];
}

function collectionPathSplit(e) {
  if (!e) return ['main', 'users'];
  if (e.includes(':')) {
    const [ds, name] = splitCollectionName(e);
    if (ds && name) return [ds, name];
  }
  const parts = e.split('.');
  return parts.length > 1 ? [parts[0], parts.slice(1).join('.')] : ['main', e];
}

/** Resolve the root flowEngine's dataSourceManager (walk previousEngine chain). */
function rootDataSourceManager(engine) {
  let manager = engine?.dataSourceManager;
  let prev = engine?.previousEngine;
  while (prev) {
    manager = prev.dataSourceManager;
    prev = prev.previousEngine;
  }
  return manager;
}

// chunk 502/733 virtual-association helpers ------------------------------
const VIRTUAL_RELATIONS = {
  approvals: [{ name: 'data', foreignKey: 'dataKey' }],
  approvalRecords: [
    { name: 'data' },
    { name: 'dataAfter' },
  ],
};

const TASK_CARD_HIDDEN_FIELDS = ['rounds', 'latestRound', 'records', 'applicantRole', 'prevRecord', 'approval', 'user', 'createdBy', 'data', 'dataAfter'];
const APPROVAL_DETAILS_HIDDEN_FIELDS = ['rounds', 'latestRound', 'records', 'applicantRole', 'prevRecord', 'approval', 'user', 'createdBy', 'data', 'dataAfter'];
const TASK_CARD_WHITELIST = ['workflow.title', 'approval.createdBy.nickname'];
const TASK_CARD_BLACKLIST = [
  'rounds', 'latestRound', 'records', 'applicantRole', 'prevRecord',
  'approval.rounds', 'approval.records', 'approval.latestRound', 'approval.applicantRole',
  'approval.data', 'approval.workflow.*', 'approval.workflow', 'approval.createdBy.*',
  'node.upstream', 'node.downstream', 'workflow.*', 'createdBy', 'user',
];

function matchesPattern(name, patterns) {
  if (patterns.includes(name)) return true;
  return patterns.some((p) => !!p.endsWith('*') && name.startsWith(p.slice(0, -1)));
}

function isReadableAssociation(name, options = {}) {
  const whitelist = [...TASK_CARD_WHITELIST, ...(options.whitelist ?? [])];
  const blacklist = [...TASK_CARD_BLACKLIST, ...(options.blacklist ?? [])];
  return !matchesPattern(name, whitelist) && matchesPattern(name, blacklist);
}

/** Resolve { dataDataSourceKey, dataCollectionName } from a model context (chunk 502 `I`). */
function resolveDataCollection(ctx) {
  if (ctx.dataDataSourceKey && ctx.dataCollectionName) {
    return { dataDataSourceKey: ctx.dataDataSourceKey, dataCollectionName: ctx.dataCollectionName };
  }
  const [ds, name] = splitCollectionName(
    ctx.workflowCollectionName || ctx.form?.values?.collection || ctx.workflow?.config?.collection,
  );
  if (ds && name) return { dataDataSourceKey: ds, dataCollectionName: name };
  return undefined;
}

/** Virtual belongsTo CollectionField pointing at the business record (chunk 502 class E + fn R). */
function makeVirtualCollectionField(FlowEngineCollectionField, NS_, { baseCollectionName, fieldName, dataDataSourceKey, dataCollectionName }) {
  const rel = (VIRTUAL_RELATIONS[baseCollectionName] ?? []).find((r) => r.name === fieldName);
  if (!rel) return undefined;
  return new FlowEngineCollectionField({
    type: 'belongsTo',
    name: fieldName,
    dataSourceKey: dataDataSourceKey,
    target: dataCollectionName,
    foreignKey: rel.foreignKey,
    interface: 'm2o',
    isAssociation: true,
    uiSchema: {
      title: `{{t("Approval Data", { ns: "${NS_}" })}}`,
    },
  });
}

function resolveApprovalDataFieldPath({ context, params, supportsApprovalDataAssociationFields }) {
  if (!(params.dataSourceKey && params.collectionName && params.fieldPath)) return undefined;
  const collection = context.dataSourceManager.getCollection(params.dataSourceKey, params.collectionName);
  if (!collection) return undefined;
  const segments = params.fieldPath.split('.');
  let current = collection;
  let virtualIndex = -1;
  const FlowEngineCollectionField = require('@nocobase/flow-engine').CollectionField;
  for (let i = 0; i < segments.length; i += 1) {
    let field = current.getField(segments[i]);
    if (i === 0 && (segments[i] === 'data' || segments[i] === 'dataAfter')) {
      const dataCol = resolveDataCollection(context);
      if (!dataCol) return undefined;
      if (!(field && field.type === 'belongsTo' && field.target === dataCol.dataCollectionName && field.options?.dataSourceKey === dataCol.dataDataSourceKey)) {
        field = makeVirtualCollectionField(FlowEngineCollectionField, NS, {
          baseCollectionName: current.name,
          fieldName: segments[i],
          dataCollectionName: dataCol.dataCollectionName,
          dataDataSourceKey: dataCol.dataDataSourceKey,
        });
        if (!field) return undefined;
        field.setCollection(current);
      }
      virtualIndex = i;
    }
    if (!field || (virtualIndex !== -1 && i > virtualIndex && field.target && !supportsApprovalDataAssociationFields)) break;
    if (i === segments.length - 1) return field;
    current = field.targetCollection;
    if (!current) break;
  }
  return undefined;
}

module.exports = {
  NS,
  APPROVAL_STATUS,
  RECORD_STATUS,
  RECORD_TYPE,
  NOTIFICATION_KIND,
  TEMPLATE_TYPE,
  RETURN_TYPE,
  RETURN_NODE_OPTIONS,
  APPROVAL_STATUS_LIST,
  APPROVAL_STATUS_META,
  RECORD_STATUS_LIST,
  RECORD_STATUS_META,
  TASK_TYPE_APPLY,
  TASK_TYPE_TODOS,
  HIDE_APPLY_FORM_DELETE_ACTION,
  MZ,
  translateLabel,
  isObj,
  toStringValue,
  strOrEmpty,
  compact,
  groupHasChildren,
  splitCollectionName,
  collectionPathSplit,
  rootDataSourceManager,
  VIRTUAL_RELATIONS,
  TASK_CARD_HIDDEN_FIELDS,
  APPROVAL_DETAILS_HIDDEN_FIELDS,
  TASK_CARD_WHITELIST,
  TASK_CARD_BLACKLIST,
  matchesPattern,
  isReadableAssociation,
  resolveDataCollection,
  makeVirtualCollectionField,
  resolveApprovalDataFieldPath,
};
