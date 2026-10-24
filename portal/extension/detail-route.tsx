import { ApprovalDetailRoute } from "./components/detail-dialog";

/**
 * 批16：详情路由组件（列表路由 children，RouteDrawer 承载）。
 * 两个入口各自锚定视图类型：applications 面取 approvals:get，
 * todos 面取 approvalRecords:get（detail-dialog 内按 view 分流）。
 */
export function ApprovalApplicationDetailRoute() {
  return <ApprovalDetailRoute view="application" />;
}

export function ApprovalRecordDetailRoute() {
  return <ApprovalDetailRoute view="record" />;
}
