import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity, useTranslate } from "@refinedev/core";
import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActionLayer } from "./action-layer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import {
  createApproval,
  destroyApproval,
  updateApproval,
  withdrawApproval,
  type ApprovalApplication,
  type ApprovalWorkflow,
} from "../api";
import {
  buildDefaultFormTree,
  applyFormStrategy,
  applyCanAct,
  buildFormData,
  computeUpdateAssociationValues,
  fetchFormRecord,
  getApplyPattern,
  isEditableApproval,
  isActorAllowed,
  loadApplyFormTree,
  mergeFormValues,
  type FormActionKind,
  type FormTree,
} from "../form-models";
import { approvalKeys } from "../query-keys";
import { APPROVAL_STATUS } from "../shared";

/** D#29/#31 可再写状态（:850）。 */
const EDITABLE_STATUSES: number[] = [APPROVAL_STATUS.DRAFT, APPROVAL_STATUS.RETURNED];
import {
  FormFieldsRenderer,
  useFormFieldMeta,
  validateFormFields,
} from "./form-fields";

/**
 * ApplyForm — docs/13 面 D#4/#8/#25/#27-#31 的 portal 块级装配：
 *
 * - 一个表单组件、两个入口（勿并存两套）：apply-new 发起弹窗（pattern=createNew）
 *   与申请详情「编辑重新提交」（pattern=edit，DRAFT/RETURNED）；
 * - 快照带出（D#8）：baseValues=recordShowMode&&status!=null ? approval.data‖
 *   latestRound.snapshot : latestRound.snapshot；edit 模式且 shouldReload 时经
 *   getBusinessRecord 拉最新记录叠盖（D#7/#10 resource refresh→syncFormWithResourceData）；
 * - 动作族（D#27-#31）：Submit/SaveDraft/Withdraw/Delete 按树内配置动作渲染
 *   （createModelOptions 默认仅 Submit，SaveDraft 官方 hide:true 配置态开启）；
 *   可见性 = applyCanAct（D#27）/本人+withdrawable===true+SUBMITTED（D#30）/
 *   DRAFT|RETURNED+有 id（D#31）；
 * - 提交链（D#29）：isEditableApproval 守卫 → uiSchema 必填校验（skipRequiredValidation
 *   可跳）→ confirmStep 确认弹窗 → 有 id 走 approvals:update，无 id 校验 workflowId 后
 *   走 approvals:create（values:{collectionName,data,status}+updateAssociationValues）。
 */

export type ApplyWriteKind = Extract<FormActionKind, "withdraw" | "delete">;

/** D#30/#31 撤回/删除运行链 + confirmStep 弹窗（ApplyForm 与详情操作条共用）。 */
function useApprovalWriteActions(approval: ApprovalApplication | null, onDone: () => void) {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const [confirmKind, setConfirmKind] = useState<ApplyWriteKind | null>(null);
  const [busy, setBusy] = useState(false);

  const runWithdraw = async () => {
    if (approval?.id == null) return;
    setBusy(true);
    try {
      await withdrawApproval(approval.id);
      toast.success(
        translate("approval.apply.withdrawnSuccessfully", { ns: "app" }, "Withdrawn successfully")
      );
      setConfirmKind(null);
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      onDone();
    } catch {
      toast.error(translate("approval.apply.withdrawnFailed", { ns: "app" }, "Withdrawn failed"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (approval?.id == null) return;
    setBusy(true);
    try {
      await destroyApproval(approval.id);
      toast.success(
        translate("approval.apply.deletedSuccessfully", { ns: "app" }, "Deleted successfully")
      );
      setConfirmKind(null);
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      onDone();
    } catch {
      toast.error(translate("approval.apply.deleteFailed", { ns: "app" }, "Delete failed"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = confirmKind
    ? confirmKind === "withdraw"
      ? {
          title: translate("approval.apply.withdraw", { ns: "app" }, "Withdraw"),
          body: translate(
            "approval.apply.withdrawConfirm",
            { ns: "app" },
            "Are you sure you want to withdraw it?"
          ),
          onOk: runWithdraw,
          danger: false,
        }
      : {
          title: translate("approval.apply.delete", { ns: "app" }, "Delete"),
          body: translate(
            "approval.apply.deleteConfirm",
            { ns: "app" },
            "Are you sure you want to delete this approval? This action cannot be undone."
          ),
          onOk: runDelete,
          danger: true,
        }
    : null;

  const dialog = (
    <AlertDialog
      open={!!confirm}
      onOpenChange={(open) => {
        if (!open) setConfirmKind(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title ?? ""}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.body ?? ""}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {translate("approval.actions.cancel", { ns: "app" }, "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant={confirm?.danger ? "destructive" : "default"}
            onClick={(event) => {
              event.preventDefault();
              confirm?.onOk();
            }}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {translate("approval.actions.confirmOk", { ns: "app" }, "OK")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { busy, openConfirm: setConfirmKind, dialog };
}

export interface ApplyFormProps {
  /**
   * 配置界面树根 uid（workflow.config.approvalUid）。批6 发起放宽：缺省时走
   * buildDefaultFormTree 默认字段表单（触发器 collection 字段全量渲染）。
   */
  uid?: string;
  workflow: ApprovalWorkflow;
  /** 编辑态审批（草稿/退回）；缺省=发起新申请（createNew）。 */
  approval?: ApprovalApplication | null;
  close: () => void;
  onDone: () => void;
}

export function ApplyForm({ uid, workflow, approval, close, onDone }: ApplyFormProps) {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const currentUserId = identity?.id ?? null;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSave, setConfirmSave] = useState<"submit" | "saveDraft" | null>(null);
  const [busy, setBusy] = useState(false);

  const fallbackCollection =
    workflow.config?.collection ?? approval?.collectionName ?? undefined;

  // D#1/#11 表单树装载（React Query 缓存）；批6：无 uid → 触发器 collection 默认字段表单
  const treeQuery = useQuery({
    queryKey: uid
      ? approvalKeys.formTree(uid)
      : approvalKeys.defaultFormTree(fallbackCollection ?? ""),
    enabled: !!uid || !!fallbackCollection,
    queryFn: () =>
      uid
        ? loadApplyFormTree(uid, workflow)
        : buildDefaultFormTree(fallbackCollection),
    staleTime: 60_000,
  });
  const tree: FormTree | null = treeQuery.data ?? null;
  const { resolveField } = useFormFieldMeta(tree?.fields ?? []);

  const collectionName =
    tree?.collectionName ?? workflow.config?.collection ?? approval?.collectionName ?? "";
  const strategy = useMemo(
    () => applyFormStrategy({ workflow, approval }),
    // approval 对象引用随详情刷新变化，按状态维度记忆即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow?.id, approval?.id, approval?.status]
  );

  // D#7/#10 shouldReload → 拉最新记录，baseValues ∪ record 作为表单初值
  const recordQuery = useQuery({
    queryKey: approvalKeys.formRecord(collectionName, strategy.filterByTk ?? ""),
    enabled: !!collectionName && strategy.filterByTk != null && strategy.shouldReload,
    queryFn: () => fetchFormRecord(collectionName, strategy),
    staleTime: 15_000,
  });
  const mergedValues = useMemo(
    () => mergeFormValues(strategy, recordQuery.data),
    [strategy, recordQuery.data]
  );
  useEffect(() => {
    setValues(mergedValues);
    // 策略/记录变化整体重置（v2 syncFormWithResourceData setFieldsValue 语义）
  }, [mergedValues]);

  const pattern = strategy.pattern;
  const loading = treeQuery.isPending;

  const write = useApprovalWriteActions(approval ?? null, onDone);
  const busyAll = busy || write.busy;

  // ------------------------------------------------------- D#27-#31 动作可见性

  const treeActions = tree?.actions ?? [];
  const actions: FormActionKind[] = useMemo(() => {
    const kinds = treeActions.map((action) => action.kind);
    // 树内无动作行 → define 默认 actions:[Submit]（:2322）
    if (!kinds.length && pattern !== "details") return ["submit"];
    return kinds;
  }, [treeActions, pattern]);

  const actorAllowed = isActorAllowed(currentUserId, approval);
  const withdrawable = workflow.config?.withdrawable === true;
  const status = approval?.status;
  const visibleActions = actions.filter((kind) => {
    if (kind === "submit" || kind === "saveDraft") {
      return (
        applyCanAct(currentUserId, approval) &&
        (pattern === "createNew" || pattern === "edit")
      );
    }
    if (kind === "withdraw") {
      return (
        actorAllowed &&
        approval?.id != null &&
        withdrawable &&
        Number(status) === APPROVAL_STATUS.SUBMITTED
      );
    }
    if (kind === "delete") {
      return (
        actorAllowed &&
        approval?.id != null &&
        EDITABLE_STATUSES.includes(Number(status))
      );
    }
    return false;
  });

  const skipRequiredValidation = (kind: FormActionKind) =>
    treeActions.find((action) => action.kind === kind)?.skipRequiredValidation ?? false;

  // ----------------------------------------------------------- D#29 提交链

  const runSave = async (statusValue: number) => {
    if (!isEditableApproval(approval)) {
      toast.error(
        translate(
          "approval.apply.onlyEditableResubmit",
          { ns: "app" },
          "Only draft or returned approvals can be resubmitted."
        )
      );
      return;
    }
    const nextErrors = skipRequiredValidation(
      statusValue === APPROVAL_STATUS.SUBMITTED ? "submit" : "saveDraft"
    )
      ? {}
      : validateFormFields(tree?.fields ?? [], resolveField, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!collectionName) {
      toast.error(translate("approval.apply.submitFailed", { ns: "app" }, "Submitted failed"));
      return;
    }
    const data = buildFormData(tree?.fields ?? [], values);
    const updateAssociationValues = computeUpdateAssociationValues(
      tree?.fields ?? [],
      resolveField,
      values
    );
    setBusy(true);
    try {
      if (approval?.id != null) {
        await updateApproval({
          filterByTk: approval.id,
          collectionName,
          status: statusValue,
          data,
          updateAssociationValues,
        });
      } else {
        if (workflow.id == null) throw new Error("Workflow ID is required");
        await createApproval({
          collectionName,
          workflowId: workflow.id,
          status: statusValue,
          data,
        });
      }
      toast.success(
        translate("approval.apply.submitted", { ns: "app" }, "Submitted successfully")
      );
      setConfirmSave(null);
      close();
      onDone();
    } catch (error) {
      toast.error(
        (error instanceof Error && error.message) ||
          translate("approval.apply.submitFailed", { ns: "app" }, "Submitted failed")
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    // 批10：载入骨架（内容形态），替代转圈
    return (
      <div className="flex flex-col gap-4 p-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (!tree || !tree.fields.length) {
    // A#38 兜底：无配置界面树且默认字段表单也为空 → Empty（applyNew.jsx:332-338 等价）
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>
            {translate(
              "approval.apply.notConfigured",
              { ns: "app" },
              "This workflow has no form available to initiate."
            )}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const actionLabel = (kind: FormActionKind) =>
    translate(
      kind === "submit"
        ? "approval.actions.submit"
        : kind === "saveDraft"
          ? "approval.apply.saveDraft"
          : kind === "withdraw"
            ? "approval.apply.withdraw"
            : "approval.apply.delete",
      { ns: "app" },
      kind === "submit"
        ? "Submit"
        : kind === "saveDraft"
          ? "Save draft"
          : kind === "withdraw"
            ? "Withdraw"
            : "Delete"
    );

  const saveConfirm =
    confirmSave === "submit"
      ? {
          title: translate("approval.apply.performSubmit", { ns: "app" }, "Perform the Submit"),
          body: translate(
            "approval.apply.performSubmitBody",
            { ns: "app" },
            "Are you sure you want to perform the Submit action?"
          ),
          onOk: () => void runSave(APPROVAL_STATUS.SUBMITTED),
        }
      : confirmSave === "saveDraft"
        ? {
            title: translate(
              "approval.apply.performSaveDraft",
              { ns: "app" },
              "Perform the Save draft"
            ),
            body: translate(
              "approval.apply.performSaveDraftBody",
              { ns: "app" },
              "Are you sure you want to perform the Save draft action?"
            ),
            onOk: () => void runSave(APPROVAL_STATUS.DRAFT),
          }
        : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {!uid ? (
          <p className="mb-3 text-xs text-muted-foreground">
            {translate(
              "approval.apply.defaultFormHint",
              { ns: "app" },
              "No apply interface configured — the form below is generated from the data table fields."
            )}
          </p>
        ) : null}
        <FormFieldsRenderer
          fields={tree.fields}
          resolveField={resolveField}
          values={values}
          errors={errors}
          readOnly={pattern === "details"}
          disabled={busyAll}
          idPrefix="approval-apply-form"
          onChange={(fieldPath, value) => {
            setValues((prev) => ({ ...prev, [fieldPath]: value }));
            setErrors((prev) => {
              if (!prev[fieldPath]) return prev;
              const next = { ...prev };
              delete next[fieldPath];
              return next;
            });
          }}
        />
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" disabled={busyAll} onClick={close}>
          {translate("approval.actions.cancel", { ns: "app" }, "Cancel")}
        </Button>
        {visibleActions.map((kind) =>
          kind === "withdraw" || kind === "delete" ? (
            <Button
              key={kind}
              disabled={busyAll}
              variant={kind === "delete" ? "destructive" : "outline"}
              onClick={() => write.openConfirm(kind)}
            >
              {actionLabel(kind)}
            </Button>
          ) : (
            <Button
              key={kind}
              disabled={busyAll}
              onClick={() => setConfirmSave(kind as "submit" | "saveDraft")}
            >
              {actionLabel(kind)}
            </Button>
          )
        )}
      </div>

      {/* D#29 confirmStep：确认后才执行（取消即 exit）；撤回/删除确认在 write.dialog */}
      <AlertDialog
        open={!!saveConfirm}
        onOpenChange={(open) => {
          if (!open) setConfirmSave(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{saveConfirm?.title ?? ""}</AlertDialogTitle>
            <AlertDialogDescription>{saveConfirm?.body ?? ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAll}>
              {translate("approval.actions.cancel", { ns: "app" }, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busyAll}
              onClick={(event) => {
                event.preventDefault();
                saveConfirm?.onOk();
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {translate("approval.actions.confirmOk", { ns: "app" }, "OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {write.dialog}
    </div>
  );
}

// ------------------------------------------- D#30/#31 申请详情操作条

/**
 * 申请详情操作区（v2 克隆 ApplyDetailContent 撤回/删除条 + v2 官方 ApplyForm 动作族的
 * portal 装配）：edit pattern（DRAFT/RETURNED）+ 本人 → 「编辑并重新提交」入口（打开
 * 同一 ApplyForm，快照带出）；SUBMITTED+withdrawable → 撤回；DRAFT/RETURNED+有 id → 删除。
 * 批6 发起放宽：无 approvalUid 的工作流按触发器 collection 走默认字段表单再提交
 * （「编辑并重新提交」不再是配置工作流专属）；仅当无任何 collection 通道时不渲染。
 * HIDE_APPLY_FORM_DELETE_ACTION 旗标（:2233，宿主契约位）portal 无写入方，按未隐藏处理。
 */
export function ApplyDetailActions({
  workflow,
  approval,
  refresh,
  onActionsChange,
}: {
  workflow: ApprovalWorkflow | null | undefined;
  approval: ApprovalApplication | null;
  refresh: () => void;
  /** 批10：按钮组上报——详情 Sheet 固定底栏（同 ProcessFormActions）。 */
  onActionsChange?: (node: React.ReactNode | null) => void;
}) {
  const translate = useTranslate();
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const [editing, setEditing] = useState(false);
  const write = useApprovalWriteActions(approval, refresh);

  // —— 纯计算上移（无 hooks；approval/workflow 为空时全部收敛为 false/undefined）——
  const uid =
    typeof workflow?.config?.approvalUid === "string" && workflow.config.approvalUid
      ? workflow.config.approvalUid
      : undefined;
  const hasCollectionChannel =
    !!workflow?.config?.collection || !!approval?.collectionName;
  const pattern = getApplyPattern(approval?.status);
  const actorAllowed = isActorAllowed(identity?.id ?? null, approval);
  const canEdit = actorAllowed && isEditableApproval(approval);
  const canWithdraw =
    actorAllowed &&
    workflow?.config?.withdrawable === true &&
    Number(approval?.status) === APPROVAL_STATUS.SUBMITTED;
  const canDelete =
    actorAllowed &&
    EDITABLE_STATUSES.includes(Number(approval?.status));
  // 批10：按钮组经 onActionsChange 上报到底栏（openConfirm/setEditing 是 useState
  // setter，闭包稳定）；无任何可用动作时上报 null。
  // ⚠ hooks 纪律：effect 位于所有早退 return 之前——同一实例跨详情翻转（lastTarget
  //   冻结复用）时 hooks 计数变化触发 React #300/#310（见 process-form 同批修复）。
  useEffect(() => {
    if (!onActionsChange) return;
    if (!canEdit && !canWithdraw && !canDelete) {
      onActionsChange(null);
      return;
    }
    onActionsChange(
      <>
        {canEdit ? (
          <Button size="sm" onClick={() => setEditing(true)}>
            {translate("approval.apply.editResubmit", { ns: "app" }, "Edit & resubmit")}
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button
            size="sm"
            variant="outline"
            disabled={write.busy}
            onClick={() => write.openConfirm("withdraw")}
          >
            {translate("approval.apply.withdraw", { ns: "app" }, "Withdraw")}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={write.busy}
            onClick={() => write.openConfirm("delete")}
          >
            {translate("approval.apply.delete", { ns: "app" }, "Delete")}
          </Button>
        ) : null}
      </>
    );
    return () => onActionsChange(null);
  }, [onActionsChange, canEdit, canWithdraw, canDelete, write.busy]);

  // —— 早退：所有 hooks 之后 ——
  if (!workflow || !approval?.id) return null;
  if (!uid && !hasCollectionChannel) return null;
  if (!canEdit && !canWithdraw && !canDelete) return null;

  // 批10：按钮组已上报固定底栏；编辑重提为详情抽屉之上的第二层抽屉（批18，
  // 用户裁决「再弹一个抽屉」——返回键/滑动先关编辑层回详情，不再全屏 Dialog）
  return (
    <>
      <ActionLayer
        open={editing}
        onOpenChange={setEditing}
        title={translate("approval.apply.editResubmit", { ns: "app" }, "Edit & resubmit")}
      >
        {editing ? (
          <ApplyForm
            uid={uid}
            workflow={workflow}
            approval={approval}
            close={() => setEditing(false)}
            onDone={refresh}
          />
        ) : null}
      </ActionLayer>
      {write.dialog}
    </>
  );
}
