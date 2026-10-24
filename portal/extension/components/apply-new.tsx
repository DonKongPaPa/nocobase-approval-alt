import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import {
  AlertTriangle,
  ChevronRight,
  CircleAlert,
  Filter,
  Plus,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { APPLY_FLOWS_PAGE_SIZE, listApprovalFlows, type ApprovalWorkflow } from "../api";
import {
  buildUserFilter,
  invalidateApprovalQueriesAfterWrite,
  type ApplyFlowFilterState,
} from "../shared";
import { ApplyForm } from "./apply-form";
import { FORM_DIALOG_MOBILE_FULLSCREEN } from "./action-dialog";

const str = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : undefined;

// ------------------------------------------------------------- A#28 main button

/**
 * A#28-#40 「发起新申请」：primary+Plus 主按钮 → Drawer（workflows:listApprovalFlows
 * + 紧凑筛选 + 刷新 + 分页 + 工作流卡片门控）→ Modal 弹窗表单。
 *
 * 批6 发起放宽（用户反馈「发起新申请无法使用」）：usable 门控从
 * `config.approvalUid‖config.applyForm` 放宽为 **`config.collection` 即可**——
 * v3 上无配置通道的 API 建工作流全部被旧门控禁用=死路。点卡片后：
 * approvalUid → 配置界面树表单；仅 collection → 默认字段表单（buildDefaultFormTree
 * 按触发器 collection 字段渲染，approvals:create 提交）；「未配置」仅当无 collection。
 * 卡片禁用态仅保留 invalid（配置残缺）场景。
 *
 * v2 宿主槽是任务中心 taskType.Actions（tabBarExtraContent）；v3 portal 无该槽位，
 * 按本轮 ask 放在「我的申请」页头右侧。
 */
export function ApplyNewAction({ onSubmitted }: { onSubmitted?: () => void }) {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<ApplyFlowFilterState>({});
  const [filterDraft, setFilterDraft] = useState<ApplyFlowFilterState>({});
  const [list, setList] = useState<{
    loading: boolean;
    rows: ApprovalWorkflow[];
    total: number;
  }>({ loading: false, rows: [], total: 0 });
  const [selected, setSelected] = useState<ApprovalWorkflow | null>(null);
  const [tick, setTick] = useState(0);

  // A#33：fetchApplyFlows {filter, page, pageSize:20, sort:-createdAt}，保筛选保页码
  useEffect(() => {
    if (!drawerOpen) return;
    let alive = true;
    setList((prev) => ({ ...prev, loading: true }));
    listApprovalFlows({ page, filter: buildUserFilter(filter) })
      .then((result) => {
        if (alive) setList({ loading: false, ...result });
      })
      .catch(() => {
        if (alive) setList({ loading: false, rows: [], total: 0 });
      });
    return () => {
      alive = false;
    };
  }, [drawerOpen, filter, page, tick]);

  const label = translate("approval.actions.applyNew", { ns: "app" }, "Apply new");
  // A#35：抽屉刷新 = tick 自增触发重取，保留当前筛选与页码
  const refresh = () => setTick((value) => value + 1);

  const closeAll = () => {
    setDrawerOpen(false);
    setSelected(null);
  };

  // A#40 成功闭环：toast 提交成功 → 关弹窗 → 刷新「我的申请」列表
  // （v2 为 400ms 后整页 reload；v3 portal 用 React Query 失效通道等价实现）。
  // 批8：失效根从 applicationsRoot 扩到 all——侧边栏「我的审批」角标（records
  // listMine pendingCount）也要随发起联动递增。
  const handleSubmitted = () => {
    setSelected(null);
    setDrawerOpen(false);
    invalidateApprovalQueriesAfterWrite(queryClient);
    onSubmitted?.();
  };

  const totalPages = Math.max(1, Math.ceil(list.total / APPLY_FLOWS_PAGE_SIZE));

  return (
    <>
      <Button
        onClick={() => setDrawerOpen(true)}
        aria-label={label}
      >
        <Plus />
        {label}
      </Button>

      <Drawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) closeAll();
        }}
        swipeDirection="right"
      >
        <DrawerContent className="sm:[--drawer-content-width:36rem] [--drawer-content-width:100vw]">
          <DrawerHeader className="pb-0">
            <DrawerTitle>{label}</DrawerTitle>
            <DrawerDescription>
              {translate(
                "approval.apply.drawerDescription",
                { ns: "app" },
                "Pick a workflow to initiate an approval."
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Popover>
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <Filter />
                      {translate("approval.actions.filter", { ns: "app" }, "Filter")}
                    </Button>
                  }
                />
                <PopoverContent className="w-60 space-y-2" align="start">
                  <Input
                    placeholder={translate("approval.filter.name", { ns: "app" }, "Name")}
                    value={filterDraft.title ?? ""}
                    onChange={(event) =>
                      setFilterDraft((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="ID"
                    inputMode="numeric"
                    value={filterDraft.id ?? ""}
                    onChange={(event) =>
                      setFilterDraft((prev) => ({
                        ...prev,
                        id: event.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // A#34：Reset 清草稿回页 1
                        setFilterDraft({});
                        setPage(1);
                        setFilter({});
                      }}
                    >
                      {translate("approval.actions.reset", { ns: "app" }, "Reset")}
                    </Button>
                    <Button
                      size="sm"
                      className="ms-auto"
                      onClick={() => {
                        // A#34：Filter 应用回页 1
                        setPage(1);
                        setFilter({ ...filterDraft });
                      }}
                    >
                      {translate("approval.actions.filter", { ns: "app" }, "Filter")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" onClick={refresh}>
                <RotateCw />
                {translate("approval.actions.refresh", { ns: "app" }, "Refresh")}
              </Button>
            </div>

            {list.loading && list.rows.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : list.rows.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>
                    {translate("approval.list.noData", { ns: "app" }, "No data yet")}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-2">
                {list.rows.map((workflow) => (
                  <WorkflowCard
                    key={String(workflow.id)}
                    workflow={workflow}
                    onOpen={() => {
                      // A#37：点卡片关抽屉开弹窗
                      setDrawerOpen(false);
                      setSelected(workflow);
                    }}
                  />
                ))}
              </div>
            )}

            {/* A#33：仅 total>pageSize 渲染分页；showSizeChanger 概念在紧凑分页中不存在 */}
            {list.total > APPLY_FLOWS_PAGE_SIZE ? (
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate("approval.list.previousPage", { ns: "app" }, "Previous page")}
                  disabled={page <= 1 || list.loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronRight className="rotate-180" />
                </Button>
                <span className="min-w-16 text-center text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate("approval.list.nextPage", { ns: "app" }, "Next page")}
                  disabled={page >= totalPages || list.loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      {/* A#37：Modal width 800 / footer null / 标题=工作流名。批7 定位「快捷表单入口
          面板」：标题+一句描述+字段+右下按钮，与官方表单对话框形态对齐。 */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className={cn("max-w-[calc(100vw-2rem)] gap-4 sm:max-w-[800px]", FORM_DIALOG_MOBILE_FULLSCREEN)}>
          <DialogHeader>
            <DialogTitle>
              {str(selected?.title) ??
                translate("approval.apply.modalFallbackTitle", { ns: "app" }, "Apply")}
            </DialogTitle>
            <DialogDescription>
              {str(selected?.config?.usageInstructions)?.trim() ||
                translate(
                  "approval.apply.fillAndSubmit",
                  { ns: "app" },
                  "Fill in the form and submit your application."
                )}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            str(selected.config?.approvalUid) ? (
              <ApplyFormContent
                uid={str(selected.config?.approvalUid) as string}
                workflow={selected}
                close={() => setSelected(null)}
                onSubmitted={handleSubmitted}
              />
            ) : str(selected.config?.collection) ? (
              // 批6 发起放宽：无 approvalUid → 触发器 collection 字段的默认表单
              <ApplyFormContent
                uid={undefined}
                workflow={selected}
                close={() => setSelected(null)}
                onSubmitted={handleSubmitted}
              />
            ) : (
              <NotConfiguredNotice />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------ A#36 workflow card

function WorkflowCard({
  workflow,
  onOpen,
}: {
  workflow: ApprovalWorkflow;
  onOpen: () => void;
}) {
  const translate = useTranslate();
  const collection = str(workflow.config?.collection);
  // 批6 发起放宽：usable = invalid!==true && 有 config.collection（approvalUid 树可选）
  const usable = workflow.invalid !== true && !!collection;
  const title = str(workflow.title) ?? "-";
  const description =
    str(workflow.config?.usageInstructions)?.trim() ||
    translate("approval.apply.clickToInitiate", { ns: "app" }, "Click to initiate approval");
  const invalidMessage = translate(
    "approval.apply.invalidWarning",
    { ns: "app" },
    "This workflow has configuration issues and may not work properly."
  );

  return (
    <Card
      role="button"
      tabIndex={usable ? 0 : -1}
      aria-disabled={!usable}
      aria-label={title}
      onClick={() => {
        if (usable) onOpen();
      }}
      onKeyDown={(event) => {
        if (usable && (event.key === "Enter" || event.key === " ")) onOpen();
      }}
      className={`flex w-full items-center justify-between gap-2 px-4 py-3 ${
        usable ? "cursor-pointer hover:border-primary/40 hover:bg-muted/50" : "cursor-not-allowed opacity-70"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {workflow.invalid === true ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    role="img"
                    aria-label={invalidMessage}
                    className="text-red-600"
                  >
                    <AlertTriangle className="size-4" aria-hidden />
                  </span>
                }
              />
              <TooltipContent>{invalidMessage}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Card>
  );
}

// ------------------------------------------------- A#37-#40 apply form（弹窗装配）

function NotConfiguredNotice() {
  const translate = useTranslate();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <CircleAlert className="size-8 text-blue-500" aria-hidden />
      <p className="text-sm font-medium">
        {translate(
          "approval.apply.notConfigured",
          { ns: "app" },
          "This workflow has no form available to initiate."
        )}
      </p>
    </div>
  );
}

// ------------------------------------------------- A#38-#40 apply form（弹窗装配二）

/**
 * 批3：表单本体升级为 docs/13 面 D 规格的 ApplyForm（components/apply-form.tsx）——
 * 统一字段渲染器（uiSchema 必填/枚举语义、关联字段、子表只读）、快照字段带出
 * （D#8 baseValues + D#7/#10 shouldReload 拉最新记录）、动作族按树内配置渲染
 * （D#27-#31 Submit/SaveDraft/Withdraw/Delete）+ confirmStep 确认弹窗。
 * 本文件保留发起通道装配（抽屉/卡片/弹窗分支），不并存第二套表单实现。
 * 批6：uid 缺省时 ApplyForm 内部走 buildDefaultFormTree 默认字段表单。
 */

export { ApplyForm } from "./apply-form";

function ApplyFormContent({
  uid,
  workflow,
  close,
  onSubmitted,
}: {
  uid?: string;
  workflow: ApprovalWorkflow;
  close: () => void;
  onSubmitted: () => void;
}) {
  return <ApplyForm uid={uid} workflow={workflow} close={close} onDone={onSubmitted} />;
}
