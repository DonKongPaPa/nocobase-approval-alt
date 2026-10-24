import type { UrlFilter } from "./shared";

/**
 * React Query key factory — the v3 portal replacement for the v2 flow-engine
 * MultiRecordResource (refresh = invalidate/refetch on the same key).
 * 批6 收缩：workflow 管理页/配置页/界面设计器撤除后，其专属键（adminWorkflows*、
 * selectableCollections、approverUsers、usersByIds、msgTpls、audiences、flowModelsList）同步移除。
 */
export const approvalKeys = {
  all: ["workflow-approval"] as const,
  applicationsRoot: ["workflow-approval", "approvals", "listMine"] as const,
  applications: (page: number, filter: UrlFilter) =>
    ["workflow-approval", "approvals", "listMine", page, filter] as const,
  approvalRoot: (filterByTk: string | number) =>
    ["workflow-approval", "approvals", "get", String(filterByTk)] as const,
  recordsRoot: ["workflow-approval", "approvalRecords", "listMine"] as const,
  records: (page: number, filter: UrlFilter) =>
    ["workflow-approval", "approvalRecords", "listMine", page, filter] as const,
  /** 批8：侧边栏「我的审批」未处理角标（listMine {status:0} 的 meta.count；根键失效联动）。 */
  pendingCount: ["workflow-approval", "approvalRecords", "listMine", "pendingCount"] as const,
  recordRoot: (filterByTk: string | number) =>
    ["workflow-approval", "approvalRecords", "get", String(filterByTk)] as const,
  /** C-31 相关审批块（记录上下文 dataKey + collectionName）。 */
  related: (collectionName: string, dataKey: string) =>
    [
      "workflow-approval",
      "approvals",
      "listRelated",
      collectionName,
      dataKey,
    ] as const,
  /** B-26/B-27 受托候选人（approvalRecords.reassignees/<id>:list，搜索词入键）。 */
  reassignees: (recordId: string | number, type: string, search: string) =>
    [
      "workflow-approval",
      "approvalRecords",
      "reassignees",
      String(recordId),
      type,
      search,
    ] as const,
  /** B-19/B-20 列表行内任务卡 items（taskCardUid → flowModels 树投影）。 */
  taskCardItems: (uid: string) =>
    ["workflow-approval", "flowModels", "taskCard", uid] as const,
  /** D 面：表单树（workflow/node config approvalUid → ApplyForm/ProcessForm 树投影）。 */
  formTree: (uid: string) =>
    ["workflow-approval", "flowModels", "formTree", uid] as const,
  /** D#7/#10 表单实时记录（edit/recordShow 模式 resource get 等价，键含 appends 维度）。 */
  formRecord: (collectionName: string, filterByTk: string | number) =>
    [
      "workflow-approval",
      "formRecord",
      collectionName,
      String(filterByTk),
    ] as const,
  /** D 面字段元数据（collections:get {appends:[fields]}，表单渲染共用）。 */
  formCollection: (name: string) =>
    ["workflow-approval", "collections", name] as const,
  /** 批6 发起放宽：无 approvalUid 的默认字段表单树（触发器 collection 元数据投影）。 */
  defaultFormTree: (collectionName: string) =>
    ["workflow-approval", "formTree", "default", collectionName] as const,
  /** 批5b 面 G：通知模板管理列表（approvalMsgTpls:list 分页+筛选）。 */
  msgTplRoot: ["workflow-approval", "approvalMsgTpls", "page"] as const,
  msgTplPage: (page: number, filter: UrlFilter) =>
    ["workflow-approval", "approvalMsgTpls", "page", page, filter] as const,
  /** 通知渠道（notificationChannels:list，通知模板页渠道类型下拉消费）。 */
  notificationChannels: ["workflow-approval", "notificationChannels"] as const,
};
