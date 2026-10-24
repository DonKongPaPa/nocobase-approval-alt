/**
 * Unified approval API client — portal-stack equivalent of v2 `api()` (docs/13 H26)
 * built on the portal's own authenticated client (`@nocobase/portal-sdk/client`),
 * NOT the v2 bare-fetch + NOCOBASE_TOKEN scheme.
 *
 * Preserved hard contracts (docs/13 H26/H27):
 * - `X-Data-Source: main` header on every call;
 * - array query values serialize as repeated `key[]` entries;
 * - object query values serialize as JSON strings;
 * - GET/POST decided by body presence (handled by nocobaseClient.action);
 * - failures throw with the server's errors[0].message (NocoBaseHttpError).
 */
import { nocobaseClient } from "@nocobase/portal-sdk/client";

const DATA_SOURCE_HEADER = { "X-Data-Source": "main" };

/** docs/13 H27 cleanQuery：数组→key[] 逐项、对象 JSON.stringify、undefined 剔除。 */
function cleanQuery(query: Record<string, unknown>): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      out[key] = value as QueryValue;
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  /** 缺省按 nocobaseClient 约定（get/list→GET，其余→POST）；count 等只读自定义 action 传 GET。 */
  method?: "GET" | "POST";
}

async function action<T>(
  resource: string,
  actionName: string,
  options: RequestOptions = {}
): Promise<T> {
  return nocobaseClient.action<T>(resource, actionName, {
    query: options.query ? cleanQuery(options.query) : undefined,
    body: options.body,
    headers: DATA_SOURCE_HEADER,
    unwrap: "none",
    method: options.method,
  });
}

// ------------------------------------------------------------------ types

export interface WorkflowConfig {
  mode?: number;
  collection?: string;
  centralized?: boolean;
  approvalUid?: string;
  applyForm?: string;
  usageInstructions?: string;
  withdrawable?: boolean;
  [key: string]: unknown;
}

export interface ApprovalWorkflow {
  id: number;
  key?: string;
  title?: string | null;
  type?: string;
  enabled?: boolean;
  invalid?: boolean;
  config?: WorkflowConfig | null;
  description?: string | null;
  createdAt?: string;
  /** approvalRecords:get appends `workflow.nodes`（面 B 退回候选上游链来源）。 */
  nodes?: unknown[] | null;
}

export interface ApprovalCreatedBy {
  id?: number;
  nickname?: string | null;
  username?: string | null;
}

export interface ApprovalApplication {
  id: number;
  status: number;
  createdAt?: string;
  updatedAt?: string;
  collectionName?: string | null;
  dataKey?: string | null;
  data?: unknown;
  comment?: unknown;
  workflow?: ApprovalWorkflow | null;
  workflowTitle?: string | null;
  title?: string | null;
  createdBy?: ApprovalCreatedBy | null;
  createdById?: number | string | null;
  /** docs/13 面 C：详情弹窗取数（approvals:get）所需时间线关联（approvalTimeline.jsx:781-826）。 */
  rounds?: unknown[] | null;
  latestRound?: unknown | null;
  records?: unknown[] | null;
  latestExecutionId?: number | string | null;
}

/** flow_nodes 行上五操作读到的 config 键（docs/13 面 B 施工矩阵）。 */
export interface ApprovalNodeConfig {
  /** 节点开放的操作状态数字清单（缺省由客户端兜底 [2,-1,1,8,99]，v2 index.jsx:533）。 */
  actions?: Array<number | string> | null;
  /** 退回范围：-1 全部上游 / 正数最近 N 上游 / 字符串指定节点 key（returnNodesFor :1123-1136）。 */
  returnTo?: number | string | null;
  /** 加签 order 字段显隐（仅 true 显示，reassignClickFlow :1598）。 */
  order?: boolean | null;
  /** 协商模式：0（Or）时加签 order 禁用（:1599）。 */
  negotiation?: number | string | null;
  toDelegateReassigneesOptions?: { extraFieldKey?: string | null } | null;
  toAddReassigneesOptions?: { extraFieldKey?: string | null } | null;
  [key: string]: unknown;
}

/** notificationChannels:list 行（通知组渠道选择，v2 notificationsFieldset :405-417）。 */
export interface NotificationChannel {
  name?: string;
  title?: string | null;
  notificationType?: string | null;
}

/** approvalMsgTpls:list 行（通知组模板 RemoteSelect，v2 :336-343）。 */
export interface ApprovalMsgTpl {
  id?: number | string;
  title?: string | null;
  notificationType?: string | null;
  type?: string | null;
}

/**
 * approvalMsgTpls 行全量（批5b 面 G 管理页/编辑弹窗）。template 为 jsonb 模板体：
 * 服务端消费形态 {title, content[, options]}（server/notifications.js resolveMessages :95-104
 * 直取对象渲染，Handlebars 委托 notification-manager；站内信 options = url/mobileUrl/duration，
 * v2 InAppTemplateFields 五字段语义 notificationsFieldset.jsx:215-257）。
 */
export interface ApprovalMsgTplDetail extends ApprovalMsgTpl {
  template?: {
    title?: string | null;
    content?: string | null;
    options?: {
      url?: string | null;
      mobileUrl?: string | null;
      duration?: number | string | null;
    } | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}


export interface ApprovalRecordRow {
  id: number;
  status: number | null;
  title?: string | null;
  comment?: unknown;
  createdAt?: string;
  updatedAt?: string;
  nodeId?: number | string | null;
  node?: {
    id: number;
    title?: string | null;
    key?: string | null;
    type?: string | null;
    upstreamId?: number | string | null;
    config?: ApprovalNodeConfig | null;
  } | null;
  nodeTitle?: string | null;
  approval?: (ApprovalApplication & { createdBy?: ApprovalCreatedBy | null }) | null;
  workflow?: ApprovalWorkflow | null;
  user?: ApprovalCreatedBy | null;
  /** docs/13 面 C：approvalRecords:get（decorateRecord 服务端投影）附带的时间线关联。 */
  job?: unknown | null;
  execution?: unknown | null;
  approvalExecution?: unknown | null;
  dataAfter?: unknown;
  /** v2 审批记录行携带的变更前快照（processFormStrategy merged 层，:2353-2357）。 */
  dataBefore?: unknown;
}

export interface NocoListMeta {
  count?: number;
  page?: number;
  pageSize?: number;
  totalPage?: number;
  hasNext?: boolean;
}

export interface ListResponse<T> {
  data?: T[] | null;
  meta?: NocoListMeta | null;
}

export interface SingleResponse<T> {
  data?: T | null;
}

export interface ApprovalCollectionField {
  name?: string;
  type?: string | null;
  interface?: string | null;
  target?: string | null;
  uiSchema?: {
    title?: string;
    required?: boolean;
    enum?: Array<{ label: unknown; value: unknown; color?: unknown }>;
    "x-component"?: string;
    "x-component-props"?: { required?: boolean; mode?: string; autoSize?: { minRows?: number; maxRows?: number } } & Record<string, unknown>;
  } | null;
}

export interface CollectionMeta {
  name?: string;
  title?: string | null;
  filterTargetKey?: string | string[] | null;
  fields?: ApprovalCollectionField[] | null;
}

/**
 * A#38/D 面 flowModels 树节点（stepParams 由宿主按模型类型落盘）。
 * 批3 表单模型族（docs/13 面 D）消费的组：resourceSettings/fieldSettings（字段与集合）、
 * patternSettings（D#4/#5 pattern）、editItemSettings（D#18 编辑项 label/showLabel）、
 * clickSettings（D#26/#29 skipRequiredValidation / commentModelUid 契约位）。
 */
export interface FlowModelNode {
  uid: string;
  use?: string;
  parentId?: string | null;
  sortIndex?: number | null;
  /** 树挂接键（flowModels:list 行携带：grid/tabs/items/actions）。 */
  subKey?: string | null;
  subType?: string | null;
  props?: Record<string, unknown> | null;
  stepParams?: {
    resourceSettings?: { init?: { dataSourceKey?: string; collectionName?: string } };
    fieldSettings?: {
      init?: {
        fieldPath?: string;
        collectionName?: string;
        dataSourceKey?: string;
        /** 批5c 面 F 设计器覆盖：true 强制必填 / false 豁免 / undefined 跟随 uiSchema。 */
        required?: boolean;
        /** 批5c 面 F 设计器控件覆盖（portal 约定键，form-fields FieldEditor 消费）。 */
        xComponent?: string;
      };
    };
    patternSettings?: { pattern?: { pattern?: string } | string };
    editItemSettings?: {
      label?: { label?: string };
      showLabel?: { showLabel?: boolean };
    };
    clickSettings?: {
      skipRequiredValidation?: { skipValidator?: boolean };
      saveResource?: { commentModelUid?: string };
    };
  } | null;
}

export const APPROVALS_PAGE_SIZE = 20;
export const APPLY_FLOWS_PAGE_SIZE = 20;

// ------------------------------------------------------------------ actions

/** A#4：approvals:listMine，sort -createdAt，pageSize 20，appends [workflow]。 */
export function listMyApplications(params: {
  page: number;
  filter?: Record<string, unknown>;
}): Promise<ListResponse<ApprovalApplication>> {
  return action("approvals", "listMine", {
    query: {
      page: params.page,
      pageSize: APPROVALS_PAGE_SIZE,
      sort: ["-createdAt"],
      appends: ["workflow"],
      filter: params.filter ?? {},
    },
  });
}

/**
 * docs/13 面 C 弹窗数据契约（v2 index.jsx:362-363）：
 * apply 面 approvals:get 的 appends；时间线组件不自行拉数，
 * collectRounds（approvalTimeline.jsx:781-799）与 nodes 兜底（:805-807）依赖这些 appends。
 */
export const APPROVAL_DETAIL_APPENDS = [
  "createdBy",
  "records",
  "records.job",
  "records.node",
  "records.user",
  "rounds",
  "workflow.title",
  "workflow.nodes",
  "latestRound",
  "latestRound.execution",
  "latestRound.execution.jobs",
];

/** docs/13 面 C：todos 面 approvalRecords:get 的 appends（v2 index.jsx:363；v3 宿主 decorateRecord 已投影嵌套 approval，appends 仍按契约携带）。 */
export const RECORD_DETAIL_APPENDS = [
  "approval",
  "approval.createdBy",
  "approval.records",
  "approval.records.job",
  "approval.records.node",
  "approval.records.user",
  "approval.rounds",
  "approval.latestRound",
  "approval.latestRound.execution",
  "approval.latestRound.execution.jobs",
  "approval.workflow",
  "approval.workflow.nodes",
  "dataAfter",
  "execution",
  "execution.jobs",
  "job",
  "node",
  "user",
  "workflow",
  "workflow.nodes",
];

/** A#18：approvals:get {filterByTk}（详情视图携带面 C appends，列表场景未用）。 */
export function getApproval(
  filterByTk: string | number,
  appends?: string[]
): Promise<SingleResponse<ApprovalApplication>> {
  return action("approvals", "get", {
    query: appends ? { filterByTk, appends } : { filterByTk },
  });
}

/** A#5：approvalRecords:listMine，sort -createdAt，pageSize 20，appends [approval, approval.createdBy, node, workflow]。 */
export function listMyApprovalRecords(params: {
  page: number;
  filter?: Record<string, unknown>;
}): Promise<ListResponse<ApprovalRecordRow>> {
  return action("approvalRecords", "listMine", {
    query: {
      page: params.page,
      pageSize: APPROVALS_PAGE_SIZE,
      sort: ["-createdAt"],
      appends: ["approval", "approval.createdBy", "node", "workflow"],
      filter: params.filter ?? {},
    },
  });
}

/** A#18：approvalRecords:get {filterByTk}。 */
export function getApprovalRecord(
  filterByTk: string | number,
  appends?: string[]
): Promise<SingleResponse<ApprovalRecordRow>> {
  return action("approvalRecords", "get", {
    query: appends ? { filterByTk, appends } : { filterByTk },
  });
}

/**
 * C-31 相关审批块：approvals:listRelated 契约（v2 centerBlocks.jsx:265-269 / 官方 chunk 16）：
 * resource=approvals、refreshAction=listRelated、pageSize=1、sort=['-createdAt']，
 * filter={dataKey, collectionName}（多数据源 collectionName 带 `ds:` 前缀，syncRelatedFilter :319-336）。
 */
export function listRelatedApprovals(params: {
  dataKey: string;
  collectionName: string;
}): Promise<ListResponse<ApprovalApplication>> {
  return action("approvals", "listRelated", {
    query: {
      pageSize: 1,
      sort: ["-createdAt"],
      filter: {
        dataKey: params.dataKey,
        collectionName: params.collectionName,
      },
    },
  });
}

/**
 * v3 宿主兼容：宿主克隆服务端未注册 approvals:listRelated（实测 dist/server/actions.js
 * 仅 create/update/destroy/withdraw/get/listMine），listRelated 请求失败时按同一
 * 记录上下文过滤回落 approvals:listMine {filter:{dataKey, collectionName}}（等价数据路径）。
 */
export function listRelatedApprovalsFallback(params: {
  dataKey: string;
  collectionName: string;
}): Promise<ListResponse<ApprovalApplication>> {
  return listMyApplications({
    page: 1,
    filter: { dataKey: params.dataKey, collectionName: params.collectionName },
  });
}

/** 业务集合单条记录（C 面 BusinessRecordCard 快照关联补齐，taskDetailCards.jsx:189-199）。 */
export function getBusinessRecord(
  collectionName: string,
  filterByTk: string | number,
  appends: string[] = []
): Promise<SingleResponse<Record<string, unknown>>> {
  return action(collectionName, "get", {
    query: appends.length ? { filterByTk, appends } : { filterByTk },
  });
}

/** A#33：workflows:listApprovalFlows {filter, page, pageSize:20, sort:-createdAt}。 */
export async function listApprovalFlows(params: {
  page: number;
  filter?: Record<string, unknown> | undefined;
}): Promise<{ rows: ApprovalWorkflow[]; total: number }> {
  const response = await action<ApprovalWorkflow[] | ListResponse<ApprovalWorkflow>>(
    "workflows",
    "listApprovalFlows",
    {
      query: {
        page: params.page,
        pageSize: APPLY_FLOWS_PAGE_SIZE,
        sort: ["-createdAt"],
        filter: params.filter ?? {},
      },
    }
  );
  const rows = Array.isArray(response) ? response : (response.data ?? []);
  const total =
    Number(
      Array.isArray(response) ? undefined : (response.meta as NocoListMeta)?.count
    ) || rows.length;
  return { rows, total };
}

/** A#38：flowModels:get {filterByTk: uid}（v3 实测：uid 不存在时 data=null）。 */
export function getFlowModel(
  uid: string
): Promise<SingleResponse<FlowModelNode>> {
  return action("flowModels", "get", { query: { filterByTk: uid } });
}

/** A#38：flowModels:list {pageSize: 200}。 */
export function listFlowModels(): Promise<ListResponse<FlowModelNode>> {
  return action("flowModels", "list", { query: { pageSize: 200 } });
}

/**
 * v2 resolveCollectionField 的 portal 等价：客户端无 dataSourceManager，
 * 字段元数据（interface/uiSchema/target）改从宿主 collections:get 拉取。
 */
export function getCollectionMeta(
  collectionName: string
): Promise<SingleResponse<CollectionMeta>> {
  return action("collections", "get", {
    query: { filterByTk: collectionName, appends: ["fields"] },
  });
}

/**
 * A#40：提交发起。body 平铺（docs/01 线格式：values=扁平 POST body——resourcer 把
 * POST body 包为 values；**勿再手包一层 values**：portal-sdk request 原样发送 body，
 * 手包会变成 values={values:{…}}，服务端抛 "collectionName and workflowId are
 * required"。2026-10-21 浏览器实测，批1-5 六个 POST 动作同病同修）。
 */
export function createApproval(input: {
  collectionName: string;
  workflowId: number;
  status: number;
  data: Record<string, unknown>;
}): Promise<SingleResponse<ApprovalApplication>> {
  return action("approvals", "create", {
    body: {
      collectionName: input.collectionName,
      workflowId: input.workflowId,
      status: input.status,
      data: input.data,
    },
  });
}

/**
 * D#29 再提交/存草稿更新分支（patternFormModels.jsx:1067-1072）：
 * approvals:update {filterByTk, updateAssociationValues, collectionName, data, status}（body 平铺）。
 */
export function updateApproval(input: {
  filterByTk: string | number;
  collectionName: string;
  status: number;
  data: Record<string, unknown>;
  updateAssociationValues?: string[];
}): Promise<SingleResponse<ApprovalApplication>> {
  return action("approvals", "update", {
    query: input.updateAssociationValues?.length
      ? { filterByTk: input.filterByTk, updateAssociationValues: input.updateAssociationValues }
      : { filterByTk: input.filterByTk },
    body: {
      collectionName: input.collectionName,
      status: input.status,
      data: input.data,
    },
  });
}

/**
 * D#30 撤回（:2209-2211）：approvals:withdraw {filterByTk}（assign 字段赋值配置面 portal 无，
 * 不带 values 通道）。v2 有值时 request.values={data:assigned}——该 assignedValues 为
 * 配置态步骤参数，portal 运行态恒无。
 */
export function withdrawApproval(
  filterByTk: string | number
): Promise<unknown> {
  return action("approvals", "withdraw", { query: { filterByTk } });
}

/** D#31 删除（:2263）：approvals:destroy {filterByTk}。 */
export function destroyApproval(filterByTk: string | number): Promise<unknown> {
  return action("approvals", "destroy", { query: { filterByTk } });
}

// ------------------------------------------------- 面 B 五操作（B-23 ~ B-27）

export interface ReassigneeUser {
  id: number;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/**
 * B-23/B-24 通过/拒绝：approvalRecords:submit {filterByTk, values:{comment?, status, data}}
 * （patternFormModels.jsx:1449-1454；comment 走 jsonb {text} 对象语义）。
 *
 * 批3 D#38 完整契约：v2 提交链传 `{filterByTk, updateAssociationValues, appends,
 * values:{…commentValues,status,data}}`（:1449-1454）——批1 轻量原型 data 恒 {}，
 * 批3 起审批处理表单（ProcessForm）有表单值时 data=表单值，appends=策略 appends
 * （edit pattern 时 workflow.config.appends 直通，D#7），updateAssociationValues
 * 由表单内关联字段计算（portal 等价，v2 为块配置项）。
 */
export function submitApprovalRecord(params: {
  filterByTk: string | number;
  status: number;
  comment?: { text: string };
  data?: Record<string, unknown>;
  appends?: string[];
  updateAssociationValues?: string[];
}): Promise<SingleResponse<ApprovalRecordRow>> {
  return action("approvalRecords", "submit", {
    query: {
      filterByTk: params.filterByTk,
      ...(params.appends?.length ? { appends: params.appends } : {}),
      ...(params.updateAssociationValues?.length
        ? { updateAssociationValues: params.updateAssociationValues }
        : {}),
    },
    body: {
      ...(params.comment ? { comment: params.comment } : {}),
      status: params.status,
      data: params.data ?? {},
    },
  });
}

/**
 * B-25 退回：approvalRecords:return {filterByTk, comment?, status:1,
 * returnToNodeKey?, data}（body 平铺；returnToNodeKey='0' 表示发起人重新提交
 * （无候选时缺省不携带 → 服务端整轮重开，v2 index.jsx:572 原型 doReturn(undefined)））。
 * 批3 同 submit 补 appends/updateAssociationValues（D#38）。
 */
export function returnApprovalRecord(params: {
  filterByTk: string | number;
  comment?: { text: string };
  returnToNodeKey?: string | number;
  data?: Record<string, unknown>;
  appends?: string[];
  updateAssociationValues?: string[];
}): Promise<SingleResponse<ApprovalRecordRow>> {
  return action("approvalRecords", "return", {
    query: {
      filterByTk: params.filterByTk,
      ...(params.appends?.length ? { appends: params.appends } : {}),
      ...(params.updateAssociationValues?.length
        ? { updateAssociationValues: params.updateAssociationValues }
        : {}),
    },
    body: {
      ...(params.comment ? { comment: params.comment } : {}),
      status: 1,
      ...(params.returnToNodeKey !== undefined
        ? { returnToNodeKey: params.returnToNodeKey }
        : {}),
      data: params.data ?? {},
    },
  });
}

/** B-26 委派：approvalRecords:delegate {filterByTk, assignee}（body 平铺）。 */
export function delegateApprovalRecord(params: {
  filterByTk: string | number;
  assignee: number;
}): Promise<unknown> {
  return action("approvalRecords", "delegate", {
    query: { filterByTk: params.filterByTk },
    body: { assignee: params.assignee },
  });
}

/**
 * B-27 加签：approvalRecords:add {filterByTk, assignee[], order?}（body 平铺；
 * :1622-1625；order 仅 orderVisible 时携带，初值 -1 在我之前）。
 */
export function addApprovalRecordAssignees(params: {
  filterByTk: string | number;
  assignee: number[];
  order?: number;
}): Promise<unknown> {
  return action("approvalRecords", "add", {
    query: { filterByTk: params.filterByTk },
    body: {
      assignee: params.assignee,
      ...(params.order !== undefined ? { order: params.order } : {}),
    },
  });
}





/** type:'approval' 恒在（管理面只看审批工作流），与页面级 filter AND 合并。 */









/**
 * B-26/B-27 候选人（ReassignForm :1492-1495）：
 * **v3 URL 形态**：`approvalRecords/<recordId>/reassignees:list`（slash 关联资源式——
 * 点号形态 `approvalRecords.reassignees/<id>:list` 在 v3 被 gateway 整段误解析为
 * resourceIndex="<id>:list"、actionName="get"（2026-10-21 pm2 日志铁证），handler 不达）。
 * query {type:'toDelegate'|'toAdd', pageSize:200, filter?}；
 * 搜索 filter = {$and:[{$or:[{nickname:{$includes:term}},{username:{$includes:term}}]}]}（:1485-1491）。
 */
export function listReassignees(params: {
  recordId: string | number;
  type: "toDelegate" | "toAdd";
  search?: string;
}): Promise<ListResponse<ReassigneeUser>> {
  const term = params.search?.trim();
  const filter = term
    ? {
        $and: [
          {
            $or: [
              { nickname: { $includes: term } },
              { username: { $includes: term } },
            ],
          },
        ],
      }
    : undefined;
  return action(`approvalRecords/${params.recordId}/reassignees`, "list", {
    query: {
      type: params.type,
      pageSize: 200,
      ...(filter ? { filter } : {}),
    },
  });
}





/** notificationChannels:list {pageSize:200}（通知组渠道，v2 notificationsFieldset :405-417）。 */
export function listNotificationChannels(): Promise<ListResponse<NotificationChannel>> {
  return action("notificationChannels", "list", { query: { pageSize: 200 } });
}


// ------------------------------------------------- 批5b 面 G 通知模板管理页

/**
 * G15 管理列表：approvalMsgTpls:list {page, pageSize:20, filter}
 * （docs/13 G15 官方为 sort ["-createdAt"]；**偏差登记**：v3 宿主实测 2026-10-21
 * probe——approvalMsgTpls:list 携带任意 sort 参数一律 400 "Invalid SQL column or
 * table reference"（同请求去 sort 即 200；workflows:list 携带同款 sort 正常），
 * 故宿主通道省略 sort，新到优先改由页面端按 createdAt 排序（页内序）。
 * simplePaginate:true → meta 为 {hasNext,page,pageSize} 无 count。
 * 筛选 notificationType+type 可选，空 filter 实测 200。
 */
export function listApprovalMsgTplPage(params: {
  page: number;
  filter?: Record<string, unknown>;
}): Promise<ListResponse<ApprovalMsgTplDetail>> {
  return action("approvalMsgTpls", "list", {
    query: {
      page: params.page,
      pageSize: APPROVALS_PAGE_SIZE,
      filter: params.filter ?? {},
    },
  });
}

/**
 * G16 新建：approvalMsgTpls:create。body 平铺（resourcer 把 POST body 包为 values，
 * 与已浏览器实证的平铺通道（resourcer 把 POST body 包为 values））。
 */
export function createApprovalMsgTpl(values: {
  title: string;
  notificationType: string;
  type: string;
  template: Record<string, unknown>;
}): Promise<SingleResponse<ApprovalMsgTplDetail>> {
  return action("approvalMsgTpls", "create", {
    body: {
      title: values.title,
      notificationType: values.notificationType,
      type: values.type,
      template: values.template,
    },
  });
}

/**
 * G17 编辑：approvalMsgTpls:update **必须 filterByTk**（docs/13 面 G 施工提示 3：
 * uuid/snowflake 主键集合 filter={"id":…} 静默 no-op 返回 200 {} 的宿主坑）。
 */
export function updateApprovalMsgTpl(
  filterByTk: string | number,
  values: {
    title?: string;
    notificationType?: string;
    type?: string;
    template?: Record<string, unknown>;
  }
): Promise<SingleResponse<ApprovalMsgTplDetail>> {
  return action("approvalMsgTpls", "update", {
    query: { filterByTk },
    body: values,
  });
}

/** G18 删除：approvalMsgTpls:destroy {filterByTk}（行删除带 confirm 的交互归页面组件）。 */
export function destroyApprovalMsgTpl(filterByTk: string | number): Promise<unknown> {
  return action("approvalMsgTpls", "destroy", { query: { filterByTk } });
}

// ------------------------------------------------------- inbox（v3 收信箱，notification-manager in-app 渠道）

/**
 * 批14 收信箱数据通道：官方 plugin-notification-in-app-message 的「我的消息」资源
 * （dist/server/defineMyInAppMessages.js）——三读两写均服务端强制 userId=当前用户：
 * - myInAppMessages:count —— 全渠道未读数（响应 {data:{count}}）；
 * - myInAppMessages:list —— 最近消息（limit 上限 20，默认 sort -receiveTimestamp）；
 * - notificationInAppMessages:updateMyOwn —— values 白名单只有 status，filter 按 id
 *   （id 为 uuid，数字 id 会 "operator does not exist: uuid = integer"）或 status。
 * 实测 member 角色对两个资源均放行（2026-10-22，13810）。
 */
export interface InAppMessageRow {
  id: string;
  title?: string | null;
  content?: string | null;
  status?: "read" | "unread" | null;
  channelName?: string | null;
  /** 渠道真实发送路径写 Date.now() 毫秒数（InAppNotificationChannel:172）；直插行为 null，回退 createdAt。 */
  receiveTimestamp?: number | string | null;
  createdAt?: string | null;
}

/** 当前用户未读总数（铃铛角标，15s 轮询）。 */
export async function countUnreadInAppMessages(): Promise<number> {
  const payload = await action<{ data?: { count?: number } }>("myInAppMessages", "count", {
    method: "GET",
  });
  return payload?.data?.count ?? 0;
}

/** 最近消息（面板列表，最多 20 条）。 */
export async function listMyInAppMessages(limit = 20): Promise<InAppMessageRow[]> {
  const payload = await action<{ data?: { messages?: InAppMessageRow[] } }>(
    "myInAppMessages",
    "list",
    { query: { limit }, method: "GET" }
  );
  return payload?.data?.messages ?? [];
}

/** 单条已读：filter 按 uuid id，values 白名单 status。 */
export function markInAppMessageRead(id: string): Promise<unknown> {
  return action("notificationInAppMessages", "updateMyOwn", {
    query: { filter: { id } },
    body: { status: "read" },
  });
}

/** 全部已读：filter 圈当前用户全部 unread（服务端再叠加 userId=self）。 */
export function markAllInAppMessagesRead(): Promise<unknown> {
  return action("notificationInAppMessages", "updateMyOwn", {
    query: { filter: { status: "unread" } },
    body: { status: "read" },
  });
}




