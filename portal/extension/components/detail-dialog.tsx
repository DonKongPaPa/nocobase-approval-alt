import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useGetIdentity, useTranslate } from "@refinedev/core";
import { useParams } from "react-router";
import { CircleAlert, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RouteDrawer,
  RouteDrawerFooter,
} from "@/extensions/nocobase-route-surfaces";

import {
  APPROVAL_DETAIL_APPENDS,
  RECORD_DETAIL_APPENDS,
  getApproval,
  getApprovalRecord,
  type ApprovalApplication,
  type ApprovalRecordRow,
  type SingleResponse,
} from "../api";
import { approvalRoutes } from "../routes";
import { approvalKeys } from "../query-keys";
import { APPROVAL_STATUS_TAG } from "../shared";
import { ApprovalTimeline, UserChip } from "./approval-timeline";
import {
  BusinessRecordCard,
  RECORD_CARD_TAG,
  TaskNodeCard,
  formatDateTimeText,
} from "./detail-cards";
import { ApplyDetailActions } from "./apply-form";
import { ProcessFormActions, ProcessFormSnapshot } from "./process-form";
import { RelatedApprovals } from "./related-approvals";
import { StatusTag } from "./status-tag";

/**
 * 行点击详情 — docs/13 面 C（C-30 取数契约 + 语义逐项保留）的 shadcn 原生范式重做。
 *
 * 批16：承载从 Sheet 换成宿主 **RouteDrawer**（用户模块 users/show 同款 surface，
 * 用户裁决「布局照抄用户模块」）——详情改为路由驱动（/approvals/detail/:id 与
 * /approvals/todos/detail/:id，列表路由 children，列表保持挂载、筛选/滚动状态不丢）：
 * - 移动端（<lg）全屏抽屉 + base-ui Drawer 手势滑动关闭；桌面 lg:42vw 侧抽屉
 *   （RouteDrawer 内建响应式，无需自写断点类——批15 前的 Sheet 断点覆写全废弃）。
 * - 关闭动画期间内容整体卸载，批11/批13 的 lastTarget 冻结、open 门控查询机制
 *   随 Sheet 一起移除（路由组件只在打开时挂载，hook 计数恒定）。
 * - 刷新按钮走 RouteDrawer actions 槽（头部右上、与内置关闭钮同行，用户模块同款）。
 * - 动作按钮组仍由 ProcessFormActions/ApplyDetailActions 经 onActionsChange 上报，
 *   固定底栏 RouteDrawerFooter：移动端竖排（flex-col 全宽）、桌面右横排。
 * 取数契约不变：apply 面 approvals:get {filterByTk, appends=APPROVAL_DETAIL_APPENDS}，
 * todos 面 approvalRecords:get {filterByTk, appends=RECORD_DETAIL_APPENDS}。
 */
export function ApprovalDetailRoute({ view }: { view: "application" | "record" }) {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  // 当前节点高亮语义（C-23/C-24）所需 currentUserId（五操作轮次接线，透传时间线）
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const isRecordView = view === "record";
  // 批10：动作按钮组上浮到固定底栏，由两个动作组件经 onActionsChange 上报
  const [actionsNode, setActionsNode] = useState<React.ReactNode>(null);
  const recordId = String(id ?? "");

  // 面C取数契约：filterByTk + 全量 appends；路由组件挂载即打开，恒发请求
  const query = useQuery<
    SingleResponse<ApprovalApplication> | SingleResponse<ApprovalRecordRow>,
    Error
  >({
    queryKey: isRecordView
      ? approvalKeys.recordRoot(recordId)
      : approvalKeys.approvalRoot(recordId),
    enabled: !!recordId,
    queryFn: () => {
      const filterByTk = recordId;
      return isRecordView
        ? getApprovalRecord(filterByTk, RECORD_DETAIL_APPENDS)
        : getApproval(filterByTk, APPROVAL_DETAIL_APPENDS);
    },
  });

  const applicationDetail = isRecordView
    ? null
    : ((query.data as SingleResponse<ApprovalApplication> | undefined)?.data ??
      null);
  const recordDetail = isRecordView
    ? ((query.data as SingleResponse<ApprovalRecordRow> | undefined)?.data ?? null)
    : null;
  const detail: ApprovalApplication | ApprovalRecordRow | null =
    applicationDetail ?? recordDetail;

  // C-30 刷新：detail 重取（resource.refresh 等价）
  const refresh = () => void query.refetch();
  const refreshLabel = translate("approval.actions.refresh", { ns: "app" }, "Refresh");

  const title = detail
    ? isRecordView
      ? (recordDetail?.approval?.workflow?.title ??
        recordDetail?.node?.title ??
        `#${recordId}`)
      : (applicationDetail?.workflow?.title ?? `#${recordId}`)
    : translate("approval.detail.title", { ns: "app" }, "Details");

  return (
    <RouteDrawer
      title={title}
      description={`${translate(
        "approval.detail.filterByTk",
        { ns: "app" },
        "Record ID (filterByTk)"
      )} : ${recordId}`}
      actions={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={refreshLabel}
          title={refreshLabel}
          disabled={query.isFetching}
          onClick={refresh}
        >
          <RotateCw className={query.isFetching ? "animate-spin" : undefined} />
        </Button>
      }
      closeLabel={translate("approval.actions.close", { ns: "app" }, "Close")}
      closeTo={isRecordView ? approvalRoutes.todos : approvalRoutes.applications}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {query.isPending ? (
          /* 载入骨架按真实布局形态（摘要卡行 + 快照块 + 时间线点） */
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-2.5 rounded-xl border p-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between px-3 py-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-20 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ) : query.isError || !detail ? (
          <Empty className="mt-4 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>
                {translate(
                  "approval.detail.failedToLoad",
                  { ns: "app" },
                  "Failed to load details"
                )}
              </EmptyTitle>
              <Button variant="outline" size="sm" onClick={refresh}>
                {translate("approval.detail.retry", { ns: "app" }, "Retry")}
              </Button>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5 pt-4">
            <section className="flex flex-col gap-3">
              <SectionLabel>
                {translate("approval.detail.detailsTab", { ns: "app" }, "Details")}
              </SectionLabel>
              <DetailContent
                detail={detail}
                isRecordView={isRecordView}
                refresh={refresh}
                onActionsChange={setActionsNode}
              />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>
                {translate("approval.detail.processTab", { ns: "app" }, "Approval process")}
              </SectionLabel>
              <ApprovalTimeline
                source={detail}
                currentUserId={identity?.id ?? null}
                // v2 任务中心弹窗 TaskApprovalTimeline({taskRecord}) 未启用 actionEnabled；
                // 五操作轮次接入时开启并接 renderActionCard（C-22 契约已在时间线实现）。
              />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>
                {translate("approval.detail.related", { ns: "app" }, "Related approvals")}
              </SectionLabel>
              <RelatedApprovals
                detail={
                  isRecordView
                    ? ((detail as ApprovalRecordRow).approval ?? null)
                    : (detail as ApprovalApplication)
                }
              />
            </section>
          </div>
        )}
      </div>
      {/* 动作按钮组固定底栏：横排右对齐（批17 用户裁决「底部按键不用竖排」，
          覆盖 RouteDrawerFooter 的 flex-col 默认）；内容垂直滚动时始终可见。 */}
      {actionsNode ? (
        <RouteDrawerFooter className="flex-row items-center justify-end gap-2">
          {actionsNode}
        </RouteDrawerFooter>
      ) : null}
    </RouteDrawer>
  );
}

/** 分节小标题（shell 分组标签同款样式语言）。 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

// ------------------------------------------------- 详情页签：单栏流式分区

/** 紧凑属性行（Card+Separator 风格的SummaryCard 行单元）。 */
function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-end">
        {children}
      </span>
    </div>
  );
}

/**
 * 状态摘要卡（面 B RecordStatusCard + ApplyCard 语义归并）：
 * 状态（Badge 变体映射）/ 审批人（记录视图）/ 处理时间（终态才显示）/ 申请人。
 */
function DetailSummaryCard({
  record,
  approval,
}: {
  record: ApprovalRecordRow | null;
  approval: ApprovalApplication | null;
}) {
  const translate = useTranslate();
  const isRecord = record != null;
  const status = isRecord ? (record.status ?? null) : (approval?.status ?? null);
  // 终态才显示处理时间（v2 taskDetailCards.jsx :255-258：PENDING(0)/ASSIGNED(null) 除外）
  const terminal =
    isRecord && record.status !== 0 /* PENDING */ && record.status !== null /* ASSIGNED */;
  return (
    <Card size="sm" className="gap-0 overflow-hidden py-0">
      <CardContent className="flex flex-col px-0 py-0">
        <SummaryRow label={translate("approval.card.status", { ns: "app" }, "Status")}>
          <StatusTag
            value={status}
            map={isRecord ? RECORD_CARD_TAG : APPROVAL_STATUS_TAG}
          />
        </SummaryRow>
        {isRecord ? (
          <>
            <Separator />
            <SummaryRow
              label={translate("approval.card.assignee", { ns: "app" }, "Assignee")}
            >
              <UserChip data={record.user ?? null} fallback="-" />
            </SummaryRow>
            {terminal ? (
              <>
                <Separator />
                <SummaryRow
                  label={translate(
                    "approval.card.processedAt",
                    { ns: "app" },
                    "Processed at"
                  )}
                >
                  {formatDateTimeText(record.updatedAt)}
                </SummaryRow>
              </>
            ) : null}
          </>
        ) : null}
        <Separator />
        <SummaryRow label={translate("approval.timeline.apply", { ns: "app" }, "Apply")}>
          <UserChip data={approval?.createdBy ?? null} fallback="-" />
        </SummaryRow>
      </CardContent>
    </Card>
  );
}

function DetailContent({
  detail,
  isRecordView,
  refresh,
  onActionsChange,
}: {
  detail: ApprovalApplication | ApprovalRecordRow;
  isRecordView: boolean;
  refresh: () => void;
  onActionsChange?: (node: React.ReactNode | null) => void;
}) {
  const approval = (
    isRecordView
      ? ((detail as ApprovalRecordRow).approval ?? null)
      : (detail as ApprovalApplication)
  ) as ApprovalApplication | null;

  if (isRecordView) {
    const record = detail as ApprovalRecordRow;
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <DetailSummaryCard record={record} approval={approval} />
        {/* 业务快照：details 模式配置表单优先（D#17/#19），无配置回退 C 面业务卡 */}
        <ProcessFormSnapshot
          detail={record}
          head
          fallback={<BusinessRecordCard approval={approval} head />}
        />
        {/* 节点卡族（含或签/会签/投票 pill、意见引用块） */}
        <TaskNodeCard approval={approval} />
        {/* D#32-#40 五操作区：表单字段留滚动区，按钮组上报到固定底栏（批10） */}
        <ProcessFormActions detail={record} onActionsChange={onActionsChange} />
      </div>
    );
  }

  const application = detail as ApprovalApplication;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DetailSummaryCard record={null} approval={approval} />
      {/* 业务快照（C 面契约） */}
      <BusinessRecordCard approval={application} />
      {/* 申请操作条（批3 D#27-#31）：按钮组上报到固定底栏（批10） */}
      <ApplyDetailActions
        workflow={application.workflow ?? null}
        approval={application}
        refresh={refresh}
        onActionsChange={onActionsChange}
      />
    </div>
  );
}
