import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  listRelatedApprovals,
  listRelatedApprovalsFallback,
  type ApprovalApplication,
} from "../api";
import { approvalKeys } from "../query-keys";
import { APPROVAL_STATUS_TAG } from "../shared";
import { StatusTag } from "./status-tag";

/**
 * C-31 相关审批块（RelatedApprovalsModel 的 portal 等价数据块）：
 *
 * 数据契约（v2 centerBlocks.jsx:265-269 / 官方 chunk 16 / docs/13 面 C 施工提示 3）：
 * - approvals:listRelated {filter:{dataKey, collectionName}, pageSize:1, sort:['-createdAt']}；
 * - dataKey 契约（resolveDataKey :296-318）：记录上下文按集合 filterTargetKey 取值，
 *   v3 详情弹窗以 approvals 数据行自带的 dataKey / collectionName 列为记录上下文等价物
 *   （v2 getRecordData :287-293 的 context.record ‖ formData ‖ record 兜底链的 portal 对应）；
 * - 无 collectionName 或 dataKey → 整块空态（v2 refresh :338-346 setData([])）；
 * - 行渲染：workflow.title ‖ `#id` + 审批状态 Tag（renderComponent :348-369）。
 *
 * v3 兼容偏差（已登记）：宿主克隆服务端未注册 approvals:listRelated，请求失败时
 * 回落 approvals:listMine {filter:{dataKey, collectionName}}（同一记录上下文过滤）。
 */
export function RelatedApprovals({
  detail,
}: {
  detail: ApprovalApplication | null;
}) {
  const translate = useTranslate();
  const collectionName =
    typeof detail?.collectionName === "string" && detail.collectionName
      ? detail.collectionName
      : null;
  const dataKey =
    detail?.dataKey != null && detail.dataKey !== "" ? String(detail.dataKey) : null;
  const enabled = !!(collectionName && dataKey);

  const query = useQuery({
    queryKey: approvalKeys.related(collectionName ?? "", dataKey ?? ""),
    enabled,
    queryFn: async (): Promise<ApprovalApplication[]> => {
      const params = { dataKey: dataKey as string, collectionName: collectionName as string };
      try {
        const response = await listRelatedApprovals(params);
        return response.data ?? [];
      } catch {
        const fallback = await listRelatedApprovalsFallback(params);
        return fallback.data ?? [];
      }
    },
  });

  if (!enabled) return null;
  const records = query.data ?? [];

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-3 py-0">
        <CardTitle className="text-sm">
          {translate("approval.detail.related", { ns: "app" }, "Related approvals")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        {query.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("approval.list.noData", { ns: "app" }, "No data yet")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {records.map((record, index) => (
              <li
                key={String(record?.id ?? index)}
                className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-sm"
              >
                <span className="min-w-0 truncate">
                  {record?.workflow?.title ?? `#${record?.id ?? ""}`}
                </span>
                <StatusTag value={record?.status} map={APPROVAL_STATUS_TAG} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
