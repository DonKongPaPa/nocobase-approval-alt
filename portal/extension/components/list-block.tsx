import { useTranslate } from "@refinedev/core";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, ListX } from "lucide-react";

import type { NocoListMeta } from "../api";

/**
 * A#6/A#8/A#10/A#11 — 列表视图骨架（TaskBlockView 等价）：
 * 工具栏（role=toolbar）+ 紧凑行列表 + 简易分页 + 空态。
 * 行渲染与状态标签由页面通过 renderRow 注入（行=名称 + 右侧状态 Tag，rowKey=id）。
 */
export function ApprovalListBlock({
  title,
  description,
  toolbar,
  loading,
  onRefresh,
  records,
  meta,
  page,
  pageSize,
  onPageChange,
  renderRow,
  onRowClick,
  emptyHint,
}: {
  title: string;
  description?: string;
  /** A#7 工具栏：页面级动作（筛选 / 发起新申请）渲染在刷新按钮左侧 */
  toolbar?: ReactNode;
  loading: boolean;
  /** A#7：局部刷新（resource.refresh 等价 → React Query refetch） */
  onRefresh: () => void;
  records: Array<Record<string, unknown>>;
  meta: NocoListMeta | null | undefined;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  renderRow: (record: Record<string, unknown>) => { key: string; node: ReactNode };
  onRowClick: (record: Record<string, unknown>) => void;
  emptyHint?: string;
}) {
  const translate = useTranslate();
  const count = typeof meta?.count === "number" ? meta.count : undefined;
  // A#10：hasPrev=page>1；hasNext=count 可得按 page*pageSize<count 否则 meta.hasNext；
  // 两端均不可翻时整块不渲染。
  const hasPrev = page > 1;
  const hasNext =
    typeof count === "number" ? page * pageSize < count : !!meta?.hasNext;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        <div role="toolbar" className="flex items-center gap-2">
          {toolbar}
          <Button
            variant="outline"
            size="icon"
            aria-label={translate("approval.actions.refresh", { ns: "app" }, "Refresh")}
            title={translate("approval.actions.refresh", { ns: "app" }, "Refresh")}
            disabled={loading}
            onClick={onRefresh}
          >
            <RotateCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && records.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {emptyHint ? <ListX /> : <Inbox />}
              </EmptyMedia>
              <EmptyTitle>
                {translate("approval.list.noData", { ns: "app" }, "No data yet")}
              </EmptyTitle>
              {emptyHint ? <EmptyDescription>{emptyHint}</EmptyDescription> : null}
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {records.map((record) => {
              const { key, node } = renderRow(record);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-muted"
                    onClick={() => onRowClick(record)}
                  >
                    {node}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasPrev || hasNext ? (
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("approval.list.previousPage", { ns: "app" }, "Previous page")}
              disabled={!hasPrev || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-6 text-center text-sm">{page}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("approval.list.nextPage", { ns: "app" }, "Next page")}
              disabled={!hasNext || loading}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
