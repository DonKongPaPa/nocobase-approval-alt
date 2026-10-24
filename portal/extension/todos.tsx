import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useTranslate } from "@refinedev/core";
import { useState } from "react";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ListView } from "@/components/resources/views/list-view";

import {
  listMyApprovalRecords,
  type ApprovalRecordRow,
} from "./api";
import { TaskCardFields } from "./components/detail-cards";
import { FilterAction, type FilterFieldSpec } from "./components/filter-action";
import { ApprovalListBlock } from "./components/list-block";
import { StatusTag } from "./components/status-tag";
import { getTodoDetailPath } from "./routes";
import { approvalKeys } from "./query-keys";
import {
  APPROVAL_STATUS_TAG,
  mergeFilters,
  readUrlFilter,
  RECORD_STATUS_TAG,
  TODOS_FILTER_KEY,
  type UrlFilter,
} from "./shared";

/** 处理状态筛选选项：RECORD_TAG 剔除 null（v2 index.jsx:753-754）。 */
const RECORD_STATUS_OPTIONS = Object.entries(RECORD_STATUS_TAG)
  .filter(([value]) => value !== "null")
  .map(([value, meta]) => ({ value: Number(value), label: meta.labelKey }));

/** 我的审批列表筛选字段（v2 index.jsx:757-761：处理状态/审批状态多选 + 创建时间范围）。 */
const FILTER_FIELDS: FilterFieldSpec[] = [
  {
    name: "status",
    labelKey: "approval.filter.processedStatus",
    fallbackLabel: "Processed status",
    widget: "multiSelect",
    options: RECORD_STATUS_OPTIONS,
  },
  {
    name: "approval.status",
    labelKey: "approval.filter.approvalStatus",
    fallbackLabel: "Approval status",
    widget: "multiSelect",
    options: Object.entries(APPROVAL_STATUS_TAG).map(([value, meta]) => ({
      value: Number(value),
      label: meta.labelKey,
    })),
  },
  {
    name: "createdAt",
    labelKey: "approval.filter.createdAt",
    fallbackLabel: "Created at",
    widget: "dateRange",
    options: undefined,
  },
];

export const ApprovalTodosPage = () => {
  const translate = useTranslate();
  const [page, setPage] = useState(1);
  // A#31：URL 过滤契约 — 初始从 URL 读回
  const [filter, setFilter] = useState<UrlFilter>(
    () => readUrlFilter(TODOS_FILTER_KEY) ?? {}
  );
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: approvalKeys.records(page, filter),
    queryFn: () =>
      listMyApprovalRecords({ page, filter: mergeFilters(filter) }),
  });

  const records: ApprovalRecordRow[] = query.data?.data ?? [];

  return (
    <ListView resource="approvalTodos">
      <ApprovalListBlock
        title={translate("approval.pages.todos", { ns: "app" }, "My approvals")}
        description={translate(
          "approval.pages.todosDescription",
          { ns: "app" },
          "Approval tasks assigned to you."
        )}
        loading={query.isPending || query.isFetching}
        onRefresh={() => void query.refetch()}
        toolbar={
          <FilterAction
            filterKey={TODOS_FILTER_KEY}
            fields={FILTER_FIELDS.map((field) => ({
              ...field,
              options: field.options?.map((option) => ({
                value: option.value,
                label: translate(option.label, { ns: "app" }, option.label),
              })),
            }))}
            onApplied={(next) => {
              setPage(1);
              setFilter(next);
            }}
            onReset={() => {
              setPage(1);
              setFilter({});
            }}
          />
        }
        records={records as unknown as Array<Record<string, unknown>>}
        meta={query.data?.meta}
        page={page}
        pageSize={20}
        onPageChange={setPage}
        renderRow={(record) => {
          const todo = record as unknown as ApprovalRecordRow;
          return {
            key: String(todo.id ?? ""),
            node: (
              // B-19 列表卡：头=节点名+处理状态 Tag，正文=任务卡配置字段速览（v2 TodosItem）
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {todo.node?.title ?? todo.title ?? `#${todo.id ?? ""}`}
                  </span>
                  <StatusTag value={todo.status} map={RECORD_STATUS_TAG} />
                </span>
                <TaskCardFields approval={todo.approval ?? null} />
              </span>
            ),
          };
        }}
        onRowClick={(record) => {
          const todo = record as unknown as ApprovalRecordRow;
          // 批16：详情路由化 — A#9 契约（filterByTk + collectionName）由路由参数承载
          if (todo.id == null) return;
          navigate(getTodoDetailPath(todo.id));
        }}
      />
    </ListView>
  );
};

export default function ApprovalTodosRoute() {
  return (
    <CanAccess resource="approvalTodos" action="list" fallback={<AccessDenied />}>
      <ApprovalTodosPage />
    </CanAccess>
  );
}
