import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { useState } from "react";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { ListView } from "@/components/resources/views/list-view";

import {
  listMyApplications,
  type ApprovalApplication,
} from "./api";
import { ApplyNewAction } from "./components/apply-new";
import { TaskCardFields } from "./components/detail-cards";
import { FilterAction, type FilterFieldSpec } from "./components/filter-action";
import { ApprovalListBlock } from "./components/list-block";
import { StatusTag } from "./components/status-tag";
import { getApplicationDetailPath } from "./routes";
import { approvalKeys } from "./query-keys";
import {
  APPROVAL_STATUS_TAG,
  APPLY_FILTER_KEY,
  mergeFilters,
  readUrlFilter,
  type UrlFilter,
} from "./shared";

/** 我的申请列表筛选字段（v2 index.jsx:713-716：状态多选 + 申请时间范围）。 */
const FILTER_FIELDS: FilterFieldSpec[] = [
  {
    name: "status",
    labelKey: "approval.filter.approvalStatus",
    fallbackLabel: "Status",
    widget: "multiSelect",
    options: Object.entries(APPROVAL_STATUS_TAG).map(([value, meta]) => ({
      value: Number(value),
      label: meta.labelKey,
    })),
  },
  {
    name: "createdAt",
    labelKey: "approval.filter.appliedAt",
    fallbackLabel: "Applied at",
    widget: "dateRange",
    options: undefined,
  },
];

export const ApprovalApplicationsPage = () => {
  const translate = useTranslate();
  const [page, setPage] = useState(1);
  // A#31：URL 过滤契约 — 初始从 URL 读回
  const [filter, setFilter] = useState<UrlFilter>(
    () => readUrlFilter(APPLY_FILTER_KEY) ?? {}
  );
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: approvalKeys.applications(page, filter),
    queryFn: () =>
      listMyApplications({ page, filter: mergeFilters(filter) }),
  });

  const records: ApprovalApplication[] = query.data?.data ?? [];

  return (
    <ListView resource="approvals">
      <ApprovalListBlock
        title={translate("approval.pages.applications", { ns: "app" }, "My applications")}
        description={translate(
          "approval.pages.applicationsDescription",
          { ns: "app" },
          "Approvals you initiated, from draft to final state."
        )}
        loading={query.isPending || query.isFetching}
        onRefresh={() => void query.refetch()}
        toolbar={
          <>
            <FilterAction
              filterKey={APPLY_FILTER_KEY}
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
            <ApplyNewAction onSubmitted={() => void query.refetch()} />
          </>
        }
        records={records as unknown as Array<Record<string, unknown>>}
        meta={query.data?.meta}
        page={page}
        pageSize={20}
        onPageChange={setPage}
        renderRow={(record) => {
          const application = record as unknown as ApprovalApplication;
          return {
            key: String(application.id ?? ""),
            node: (
              // B-19 列表卡：头=工作流名+审批状态 Tag，正文=任务卡配置字段速览（v2 ApplyItem）
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {application.workflow?.title ?? `#${application.id ?? ""}`}
                  </span>
                  <StatusTag value={application.status} map={APPROVAL_STATUS_TAG} />
                </span>
                <TaskCardFields approval={application} />
              </span>
            ),
          };
        }}
        onRowClick={(record) => {
          const application = record as unknown as ApprovalApplication;
          // 批16：详情路由化 — A#9 契约（filterByTk + collectionName）由路由参数承载
          if (application.id == null) return;
          navigate(getApplicationDetailPath(application.id));
        }}
      />
    </ListView>
  );
};

export default function ApprovalApplicationsRoute() {
  return (
    <CanAccess resource="approvals" action="list" fallback={<AccessDenied />}>
      <ApprovalApplicationsPage />
    </CanAccess>
  );
}
