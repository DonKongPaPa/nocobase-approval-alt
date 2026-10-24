/**
 * 表单模型族 portal 等价（纯逻辑层，无 React）— docs/13 面 D 对 v2
 * `models/patternFormModels.jsx`（2457 行，官方 chunk 828 移植）的语义重建。
 *
 * v2 的 flow-engine 模型类（PatternForm* 九模型 + Apply/Process/Comment 动作族）在
 * v3 portal 无 flowEngine 宿主，落成三件套：
 *   - 本文件：pattern 状态机（D#2-#5）、快照/取数策略（D#7-#9）、可见性守卫
 *     （D#12/#27/#30/#31/#34）、flowModels 树装载（D#1/#11/#16 的 portal 消费形态）；
 *   - form-fields.tsx：统一字段渲染器（D#13/#16-#23 edit/details 双模式）；
 *   - apply-form.tsx / process-form.tsx：ApplyForm / ProcessForm 块级装配（D#25/#32 顶层）。
 *
 * 配置态契约（D#13/#14/#25/#32/#33/#37/#39/#42 的配置面分支：AddSubModelButton /
 * persistNodeConfig / AssigneesScopeEditor / commentModelUid 持久化）依赖宿主工作流
 * 设计器，portal 不承载。批6 收缩：portal 自建界面设计器（批5c 面 F）撤除，界面编排
 * 归宿主 settings 的 workflow 设计器（另一条 lane）与 AI portal 的 AI 能力；本文件
 * 仅保留运行态树读取（loadFormTree）与无配置工作流的默认字段表单回退（buildDefaultFormTree）。
 */

import {
  getBusinessRecord,
  getCollectionMeta,
  getFlowModel,
  listFlowModels,
  type ApprovalApplication,
  type ApprovalRecordRow,
  type ApprovalWorkflow,
  type FlowModelNode,
} from "./api";
import { RECORD_STATUS, APPROVAL_STATUS, splitCollectionName } from "./shared";

// ------------------------------------------------------- D#2/#3 pattern 映射表

/** patternFormModels.jsx:44-53 APPROVAL_PATTERN_MAP（发起人视角）。 */
export const APPROVAL_PATTERN_MAP: Record<number, Pattern> = {
  [APPROVAL_STATUS.DRAFT]: "edit",
  [APPROVAL_STATUS.RETURNED]: "edit",
  [APPROVAL_STATUS.PROCESSING]: "details",
  [APPROVAL_STATUS.REJECTED]: "details",
  [APPROVAL_STATUS.APPROVED]: "details",
  [APPROVAL_STATUS.SUBMITTED]: "details",
  [APPROVAL_STATUS.FAILED]: "details",
  [APPROVAL_STATUS.ABORTED]: "details",
};

/** patternFormModels.jsx:54-63 RECORD_PATTERN_MAP（审批人视角，仅无 record.status 时用）。 */
export const RECORD_PATTERN_MAP: Record<number, Pattern> = {
  [APPROVAL_STATUS.DRAFT]: "edit",
  [APPROVAL_STATUS.PROCESSING]: "edit",
  [APPROVAL_STATUS.SUBMITTED]: "edit",
  [APPROVAL_STATUS.RETURNED]: "details",
  [APPROVAL_STATUS.REJECTED]: "details",
  [APPROVAL_STATUS.APPROVED]: "details",
  [APPROVAL_STATUS.FAILED]: "details",
  [APPROVAL_STATUS.ABORTED]: "details",
};

export type Pattern = "createNew" | "edit" | "details";

export interface ApprovalLike {
  id?: number | null;
  status?: number | null;
  data?: unknown;
  dataKey?: string | null;
  collectionName?: string | null;
  createdById?: number | string | null;
  latestRound?: unknown | null;
}

/** D#4（:2279-2282）：APPROVAL_PATTERN_MAP[Number(status)] || 'createNew'。 */
export function getApplyPattern(status: number | null | undefined): Pattern {
  if (status == null) return "createNew";
  return APPROVAL_PATTERN_MAP[Number(status)] || "createNew";
}

export interface RecordLike {
  id?: number | string | null;
  status?: number | string | null;
}

/** D#5（:2335-2342）：record 含 status 键→pending?edit:details；否则 RECORD_PATTERN_MAP。 */
export function getProcessPattern(
  record: RecordLike | null | undefined,
  approvalStatus: number | null | undefined
): Pattern {
  if (record && record != null && Object.prototype.hasOwnProperty.call(record, "status")) {
    return isRecordPending(record.status) ? "edit" : "details";
  }
  if (approvalStatus == null) return "createNew";
  return RECORD_PATTERN_MAP[Number(approvalStatus)] || "createNew";
}

// ---------------------------------------------------------------- 状态守卫

/** patternFormModels.jsx:841-843 hasStatus：对象含 status 键（null 也是有效键值）。 */
export function hasStatus(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "status")
  );
}

/** :845-847 isRecordPending：status != null && Number(status)===PENDING(0)。 */
export function isRecordPending(status: unknown): boolean {
  return status != null && Number(status) === RECORD_STATUS.PENDING;
}

/** APPROVAL_STATUS_META terminated 旗标（v2 shared.js:62-65：4/-1/-2/-3 终态）。 */
const TERMINATED_STATUSES: Set<number> = new Set<number>([
  APPROVAL_STATUS.APPROVED,
  APPROVAL_STATUS.REJECTED,
  APPROVAL_STATUS.FAILED,
  APPROVAL_STATUS.ABORTED,
]);

/** D#29/#31 可再写状态（:850 DRAFT/RETURNED）。 */
const EDITABLE_STATUSES: number[] = [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.RETURNED];

/** :521-524 isTerminatedStatus。 */
export function isTerminatedStatus(status: unknown): boolean {
  return status != null && TERMINATED_STATUSES.has(Number(status));
}

/** :849-851 isEditableApproval：无 id 或 DRAFT/RETURNED 才可再写。 */
export function isEditableApproval(approval: ApprovalLike | null | undefined): boolean {
  return (
    approval == null ||
    approval.id == null ||
    EDITABLE_STATUSES.includes(Number(approval.status))
  );
}

/** :853-856 sameId（字符串归一比较）。 */
export function sameId(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b;
  return String(a) === String(b);
}

/** :866-869 isActorAllowed：无 id 记录或本人（createdById 缺省视为放行）。 */
export function isActorAllowed(
  currentUserId: number | string | null | undefined,
  approval: ApprovalLike | null | undefined
): boolean {
  return (
    approval == null ||
    approval.id == null ||
    (approval.createdById != null
      ? sameId(currentUserId, approval.createdById)
      : true)
  );
}

/**
 * D#27（:871-874 applyCanAct）：无 inputArgs ||（本人 && 可编辑）。
 * portal 无 inputArgs 通道，两参直译。
 */
export function applyCanAct(
  currentUserId: number | string | null | undefined,
  approval: ApprovalLike | null | undefined
): boolean {
  return isActorAllowed(currentUserId, approval) && isEditableApproval(approval);
}

// ------------------------------------------------------------- D#7-#9 策略

export interface WorkflowConfigLike {
  mode?: number;
  collection?: string;
  recordShowMode?: boolean;
  associationShowMode?: boolean;
  appends?: unknown;
  withdrawable?: boolean;
}

export interface FormRecordStrategy {
  pattern: Pattern;
  editable: boolean;
  terminated: boolean;
  /** D#8/#9 快照/最新层叠打底值（syncFormWithResourceData 的 baseValues）。 */
  baseValues: Record<string, unknown>;
  /** D#7 reload = editable || recordShowMode || associationShowMode。 */
  reload: boolean;
  /** reload 时 workflowConfig.appends 直通（:534），否则空。 */
  appends: string[];
  /**
   * filterByTk 兜底链（:535-545 baseValues→approval.data→filterFallbackValues 依次取
   * collection.getFilterByTK）。portal 无 collection 对象，getFilterByTK 等价为
   * approval.dataKey 优先、对象 id 兜底（记录对象均携带主键 id）。
   */
  filterByTk: string | number | null;
  /** :554 shouldReload = !mode && !terminated && filterByTk!=null && reload。 */
  shouldReload: boolean;
}

const isObj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** :118-120 compact（appends/fields 白名单压缩）。 */
function compact(list: unknown): string[] {
  if (Array.isArray(list)) return list.filter(Boolean).map(String);
  return list ? [String(list)] : [];
}

function latestRoundSnapshot(approval: ApprovalLike | null | undefined): Record<string, unknown> {
  const round = (approval as { latestRound?: unknown } | null | undefined)?.latestRound;
  return isObj(round) && isObj(round.snapshot) ? (round.snapshot as Record<string, unknown>) : {};
}

/** :535-545 的 portal getFilterByTK 等价：dataKey → value.id 链。 */
function pickRecordKey(value: unknown): string | number | null {
  if (isObj(value)) {
    const id = value.id;
    if (typeof id === "string" && id !== "") return id;
    if (typeof id === "number") return id;
  }
  return null;
}

/**
 * D#7（:526-557 normalizeFormRecordStrategy）portal 版：
 * fields 参数（非编辑且非 recordShow 时收敛 filterTargetKey）portal 不消费——
 * 详情只读渲染走配置表单字段树（D#17/#19 Display 族），不发起 collection 内省请求。
 */
export function normalizeFormRecordStrategy(input: {
  pattern: Pattern;
  approval: ApprovalLike | null | undefined;
  workflowConfig: WorkflowConfigLike;
  baseValues: Record<string, unknown>;
  filterFallbackValues?: Array<unknown>;
}): FormRecordStrategy {
  const { pattern, approval, workflowConfig, baseValues, filterFallbackValues } = input;
  const editable = pattern === "edit";
  const terminated = isTerminatedStatus(approval?.status);
  const recordShowMode = !!workflowConfig.recordShowMode;
  const associationShowMode = !!workflowConfig.associationShowMode;
  const reload = editable || recordShowMode || associationShowMode;
  const appends = reload ? compact(workflowConfig.appends) : [];
  const dataKey = approval?.dataKey ?? null;
  const filterByTk =
    dataKey ??
    pickRecordKey(baseValues) ??
    pickRecordKey(approval?.data) ??
    (filterFallbackValues ?? []).map(pickRecordKey).find((key) => key != null) ??
    null;
  return {
    pattern,
    editable,
    terminated,
    baseValues,
    reload,
    appends,
    filterByTk,
    shouldReload: !workflowConfig.mode && !terminated && filterByTk != null && reload,
  };
}

/**
 * D#8（:2284-2300 ApplyFormModel.getWorkflowConfig/getFormRecordStrategy）：
 * workflowConfig = workflow.config ∪ nodeConfig 浅合并（portal apply 侧无 nodeConfig）；
 * baseValues = recordShowMode&&status!=null ? data‖latestRound.snapshot : latestRound.snapshot。
 */
export function applyFormStrategy(input: {
  workflow: Pick<ApprovalWorkflow, "config"> | null | undefined;
  approval: ApprovalLike | null | undefined;
}): FormRecordStrategy {
  const { workflow, approval } = input;
  const workflowConfig: WorkflowConfigLike = { ...(workflow?.config ?? {}) };
  const pattern = getApplyPattern(approval?.status);
  const baseValues =
    approval?.status != null && workflowConfig.recordShowMode
      ? ((isObj(approval?.data) ? approval.data : null) ??
        latestRoundSnapshot(approval))
      : latestRoundSnapshot(approval);
  return normalizeFormRecordStrategy({ pattern, approval, workflowConfig, baseValues });
}

/**
 * D#9（:2348-2368 ProcessFormModel.getWorkflowConfig/getFormRecordStrategy）：
 * workflowConfig 只取 workflow.config；merged = snapshot ∪ dataBefore ∪ dataAfter
 * （后者胜）；baseValues = recordShowMode&&approval.data || merged；
 * filterFallbackValues = [dataAfter, dataBefore, snapshot]。
 */
export function processFormStrategy(input: {
  workflow: Pick<ApprovalWorkflow, "config"> | null | undefined;
  approval: ApprovalLike | null | undefined;
  record: Partial<ApprovalRecordRow> | null | undefined;
}): FormRecordStrategy {
  const { workflow, approval, record } = input;
  const workflowConfig: WorkflowConfigLike = { ...(workflow?.config ?? {}) };
  const pattern = getProcessPattern(record, approval?.status);
  const snapshot = isObj(record?.approvalExecution)
    ? (record.approvalExecution as Record<string, unknown>).snapshot
    : undefined;
  const merged: Record<string, unknown> = {
    ...(isObj(snapshot) ? snapshot : {}),
    ...(isObj(record?.dataBefore) ? (record.dataBefore as Record<string, unknown>) : {}),
    ...(isObj(record?.dataAfter) ? (record.dataAfter as Record<string, unknown>) : {}),
  };
  const baseValues =
    workflowConfig.recordShowMode && isObj(approval?.data)
      ? (approval.data as Record<string, unknown>)
      : merged;
  return normalizeFormRecordStrategy({
    pattern,
    approval,
    workflowConfig,
    baseValues,
    filterFallbackValues: [record?.dataAfter, record?.dataBefore, snapshot],
  });
}

/**
 * D#10（:608-615 syncFormWithResourceData）：baseValues ∪ resource.getData() → 表单值。
 * portal 的 resource get 通道 = getBusinessRecord（shouldReload 时拉取，bundle 到
 * React Query formRecord 键）。
 */
export function mergeFormValues(
  strategy: FormRecordStrategy,
  record: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return { ...(strategy.baseValues ?? {}), ...(record ?? {}) };
}

export function fetchFormRecord(
  collectionName: string,
  strategy: FormRecordStrategy
): Promise<Record<string, unknown> | null> {
  return getBusinessRecord(
    collectionName,
    strategy.filterByTk as string | number,
    strategy.appends
  ).then((response) => (response.data as Record<string, unknown> | null) ?? null);
}

// --------------------------------------------------- D#1/#11/#16 表单树装载

export type FormActionKind =
  | "submit"
  | "saveDraft"
  | "withdraw"
  | "delete"
  | "approve"
  | "reject"
  | "return"
  | "delegate"
  | "addAssignee";

/** v2 动作模型名 → portal 动作种类（registerModelLoaders.js:97-122 注册面清单）。 */
export const ACTION_USE_KIND: Record<string, FormActionKind> = {
  ApplyFormSubmitModel: "submit",
  ApplyFormSaveDraftModel: "saveDraft",
  ApplyFormWithdrawModel: "withdraw",
  ApplyFormDeleteModel: "delete",
  ProcessFormApproveModel: "approve",
  ProcessFormRejectModel: "reject",
  ProcessFormReturnModel: "return",
  ProcessFormDelegateModel: "delegate",
  ProcessFormAddAssigneeModel: "addAssignee",
};

/** 动作按钮形态（defaultProps，:2045/:2055/:2065/:2075/:2081/:2087/:2097/:2107/:2227）。 */
export const ACTION_PRESENTATION: Record<
  FormActionKind,
  { variant: "default" | "destructive" | "outline" }
> = {
  submit: { variant: "default" },
  saveDraft: { variant: "outline" },
  withdraw: { variant: "outline" },
  delete: { variant: "destructive" },
  approve: { variant: "default" },
  reject: { variant: "destructive" },
  return: { variant: "outline" },
  delegate: { variant: "outline" },
  addAssignee: { variant: "outline" },
};

export interface FormActionSpec {
  uid: string;
  kind: FormActionKind;
  /** D#26 skipRequiredValidation 步骤（clickSettings.skipValidator）。 */
  skipRequiredValidation: boolean;
}

export interface FormFieldSpec {
  uid: string;
  /** fieldSettings.init.fieldPath（可带 `.` 的关联路径）。 */
  fieldPath: string;
  collectionName?: string;
  dataSourceKey: string;
  /** D#18（:264-267）editItemSettings.label‖props.label 透传。 */
  label?: string;
  showLabel?: boolean;
  /**
   * 批5c 面 F 设计器覆盖（fieldSettings.init.required，仅 boolean 收敛）：
   * true 强制必填 / false 豁免 / undefined 跟随集合 uiSchema（批3 行为不变）。
   */
  required?: boolean;
  /**
   * 批5c 面 F 设计器控件覆盖（fieldSettings.init.xComponent，portal 约定键，
   * 对齐 v2 字段行 subModels.field.use 控件绑定的 portal 平替——登记偏离）。
   */
  xComponent?: string;
}

export interface FormTree {
  blockUid: string;
  /** resourceSettings.init.collectionName（D#11 onInit 缺省由 workflow.config.collection 回填）。 */
  collectionName?: string;
  dataSourceKey: string;
  fields: FormFieldSpec[];
  actions: FormActionSpec[];
}

const TREE_MAX_DEPTH = 6;

function useNameOf(node: FlowModelNode): string {
  return typeof node.use === "string" ? node.use : "";
}

/** D#11（:627-643）resolveCollectionFromView portal 等价：树缺省时由 workflow.config.collection 回填。 */
function resolveCollection(init: { collectionName?: string } | undefined, fallback?: string) {
  return init?.collectionName || fallback;
}

/**
 * 树装载（apply-new.tsx:502-541 loadApplyFormFields 泛化，D#1 portal 消费形态）：
 * flowModels:get{filterByTk:uid} + list 建父子树 → 深度≤6 下钻找块模型（usePattern）→
 * grid 行 → items（fieldSettings.init.fieldPath，sortIndex 稳定排序）→
 * 块直挂非 grid 子行解析动作（clickSettings.skipRequiredValidation）。
 */
export async function loadFormTree(
  uid: string,
  options: { usePattern: RegExp; fallbackCollection?: string }
): Promise<FormTree | null> {
  const [root, all] = await Promise.all([getFlowModel(uid), listFlowModels()]);
  const rootUid = root.data?.uid;
  if (!rootUid) return null;
  const rows = all.data ?? [];
  const byParent = new Map<string, FlowModelNode[]>();
  for (const node of rows) {
    const key = String(node.parentId ?? "");
    const bucket = byParent.get(key) ?? [];
    bucket.push(node);
    byParent.set(key, bucket);
  }
  let block: FlowModelNode | null = null;
  const walk = (parent: string, depth: number): FlowModelNode | null => {
    if (depth > TREE_MAX_DEPTH) return null;
    for (const node of byParent.get(parent) ?? []) {
      if (options.usePattern.test(useNameOf(node))) return node;
      const found = walk(node.uid, depth + 1);
      if (found) return found;
    }
    return null;
  };
  block = walk(rootUid, 0);
  if (!block) return null;

  const init = block.stepParams?.resourceSettings?.init ?? {};
  const collectionName = resolveCollection(init, options.fallbackCollection);
  const children = byParent.get(block.uid) ?? [];
  const grid = children.find((node) => /GridModel$/.test(useNameOf(node)));
  const itemRows = grid ? (byParent.get(grid.uid) ?? []) : [];
  const fields: FormFieldSpec[] = itemRows
    .slice()
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((node) => {
      const fieldInit = node.stepParams?.fieldSettings?.init;
      const edit = node.stepParams?.editItemSettings;
      const propsLabel = isObj(node.props) ? node.props.label : undefined;
      return {
        uid: node.uid,
        fieldPath: String(fieldInit?.fieldPath ?? ""),
        collectionName: fieldInit?.collectionName ?? collectionName,
        dataSourceKey: fieldInit?.dataSourceKey ?? "main",
        label:
          (typeof edit?.label?.label === "string" && edit.label.label) ||
          (typeof propsLabel === "string" ? propsLabel : undefined) ||
          undefined,
        showLabel:
          typeof edit?.showLabel?.showLabel === "boolean"
            ? edit.showLabel.showLabel
            : undefined,
        required:
          typeof fieldInit?.required === "boolean" ? fieldInit.required : undefined,
        xComponent:
          typeof fieldInit?.xComponent === "string" && fieldInit.xComponent
            ? fieldInit.xComponent
            : undefined,
      };
    })
    .filter((field) => field.fieldPath !== "");
  const actions: FormActionSpec[] = children
    .filter((node) => ACTION_USE_KIND[useNameOf(node)])
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((node) => ({
      uid: node.uid,
      kind: ACTION_USE_KIND[useNameOf(node)],
      skipRequiredValidation:
        node.stepParams?.clickSettings?.skipRequiredValidation?.skipValidator === true,
    }));
  return {
    blockUid: block.uid,
    collectionName,
    dataSourceKey: init.dataSourceKey ?? "main",
    fields,
    actions,
  };
}

/** 发起界面树（workflow.config.approvalUid → ApplyFormModel）。 */
export function loadApplyFormTree(uid: string, workflow: ApprovalWorkflow) {
  return loadFormTree(uid, {
    usePattern: /ApplyFormModel$/,
    fallbackCollection: workflow.config?.collection,
  });
}

/** 审批处理界面树（节点 config.approvalUid → ProcessFormModel，D#32）。 */
export function loadProcessFormTree(uid: string, workflow?: ApprovalWorkflow | null) {
  return loadFormTree(uid, {
    usePattern: /ProcessFormModel$/,
    fallbackCollection: workflow?.config?.collection,
  });
}

// --------------------------------------------------- D#29/#38 data payload

/**
 * v2 表单值经 antd name path 天然嵌套（formValues :949-952 → mergeAssignFieldValues）。
 * portal 扁平 fieldPath 组装 data 时按 `.` 嵌套（如 `user.nickname` → {user:{nickname}}），
 * 关联字段写入依赖该形状 + updateAssociationValues。
 */
export function buildFormData(fields: FormFieldSpec[], values: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const setPath = (target: Record<string, unknown>, segments: string[], value: unknown) => {
    const [head, ...rest] = segments;
    if (!rest.length) {
      target[head] = value;
      return;
    }
    const child = isObj(target[head]) ? (target[head] as Record<string, unknown>) : {};
    target[head] = child;
    setPath(child, rest, value);
  };
  for (const field of fields) {
    const value = values[field.fieldPath];
    if (value === undefined || value === "") continue;
    setPath(data, field.fieldPath.split("."), value);
  }
  return data;
}

const ASSOCIATION_TYPES = new Set([
  "belongsTo",
  "hasOne",
  "hasMany",
  "belongsToMany",
  "m2o",
  "o2o",
  "o2m",
  "m2m",
]);

/**
 * updateAssociationValues portal 等价：v2 取块配置 resource.getUpdateAssociationValues()
 * （:1066/:1447）；portal 无该配置通道，按「表单树内顶层关联字段且有值」计算——
 * 仅当关联子路径有编辑值时服务端才更新关联记录。
 */
export function computeUpdateAssociationValues(
  fields: FormFieldSpec[],
  metaOf: (field: FormFieldSpec) => { type?: string | null } | undefined,
  values: Record<string, unknown>
): string[] {
  const found = new Set<string>();
  for (const field of fields) {
    const root = field.fieldPath.split(".")[0];
    if (!root || found.has(root)) continue;
    if (values[field.fieldPath] === undefined) continue;
    const meta = metaOf(field);
    if (meta?.type && ASSOCIATION_TYPES.has(meta.type)) found.add(root);
  }
  return [...found];
}

// --------------------------------- 批6 发起放宽：默认字段表单树（无 approvalUid 回退）

/**
 * 默认发起表单排除字段：系统列（detail-cards/form-fields SYSTEM_FIELDS 同名单）+
 * `space`（业务快照卡既有的剔除项）。virtual 列无落库形态，一并剔除。
 */
const DEFAULT_FORM_EXCLUDED_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "sort",
  "space",
]);

/**
 * 批6 发起放宽（用户反馈「发起新申请无法使用」）：v3 上无配置通道的 API 建工作流
 * 没有 approvalUid/flowModels 树，发起门控放宽为「有 config.collection 即可发起」——
 * 回退分支按触发器 collection 的业务字段全量生成默认 FormTree（uiSchema 必填/枚举
 * 语义仍由 form-fields 渲染器消费 collections:get 元数据），动作走 define 默认
 * [Submit]（apply-form 的 actions 兜底，:2322 语义）。
 */
export async function buildDefaultFormTree(
  collectionName: string | undefined | null
): Promise<FormTree | null> {
  if (!collectionName) return null;
  // 元数据通道剥多数据源前缀（BusinessRecordCard/TaskCardFields split(':').pop() 同款）；
  // 树 collectionName 保留原值——createApproval/approvals 的 collectionName 通道
  // 与配置树路径（loadFormTree resolveCollection fallback）完全同形，不改提交语义。
  const [, bareName] = splitCollectionName(collectionName);
  const response = await getCollectionMeta(bareName);
  const rows = response.data?.fields ?? [];
  const fields: FormFieldSpec[] = rows
    .filter(
      (row) =>
        !!row.name &&
        !DEFAULT_FORM_EXCLUDED_FIELDS.has(String(row.name)) &&
        row.type !== "virtual"
    )
    .map((row) => ({
      uid: `default-${String(row.name)}`,
      fieldPath: String(row.name),
      collectionName: bareName,
      dataSourceKey: "main",
    }));
  return {
    blockUid: `default-${collectionName}`,
    collectionName,
    dataSourceKey: "main",
    fields,
    actions: [],
  };
}
