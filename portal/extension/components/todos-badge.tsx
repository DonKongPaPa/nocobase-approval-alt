import { useQuery } from "@tanstack/react-query";

import { listMyApprovalRecords } from "../api";
import { approvalKeys } from "../query-keys";
import { RECORD_STATUS } from "../shared";
import { PendingCountTag } from "./status-tag";

/**
 * 批8：「我的审批」侧边栏角标——未处理（PENDING）待办数。
 *
 * 视觉复用 StatusTag 同族元素（PendingCountTag：红皮肤 + Clock + 「有 X 条待处理」，
 * 即列表「⏱ 待处理」金色标签的红色变体）；壳以官方 SidebarMenuBadge 定位
 * （env app-shell/sidebar.tsx 从 resource.meta.badge 读取，批8 接线）。
 * 计数：approvalRecords:listMine {filter:{status:0}} —— 该自定义 action 返回裸数组
 * （不分页、无 meta.count），计数即 data.length。键挂在 approvalKeys 根下 →
 * 任何审批动作 invalidate all（含写后延迟补拍）随列表一起刷新。0 时渲染 null
 * （无角标）。
 */
export function TodosBadge() {
  const query = useQuery({
    queryKey: approvalKeys.pendingCount,
    queryFn: () =>
      listMyApprovalRecords({
        page: 1,
        filter: { status: RECORD_STATUS.PENDING },
      }),
    staleTime: 15_000,
  });
  const count = (query.data?.data ?? []).length;
  if (!count) return null;
  return <PendingCountTag count={count} />;
}
