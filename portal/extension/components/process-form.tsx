import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  addApprovalRecordAssignees,
  delegateApprovalRecord,
  returnApprovalRecord,
  submitApprovalRecord,
  type ApprovalRecordRow,
  type ApprovalWorkflow,
} from "../api";
import {
  ACTION_PRESENTATION,
  buildFormData,
  computeUpdateAssociationValues,
  fetchFormRecord,
  hasStatus,
  isRecordPending,
  loadProcessFormTree,
  mergeFormValues,
  processFormStrategy,
  type FormActionKind,
} from "../form-models";
import { approvalKeys } from "../query-keys";
import { invalidateApprovalQueriesAfterWrite } from "../shared";
import {
  FormFieldsRenderer,
  useFormFieldMeta,
  validateFormFields,
} from "./form-fields";
import {
  buildReturnNodes,
  CommentActionDialog,
  ReassignActionDialog,
  type CommentKind,
} from "./approval-actions";

/**
 * ProcessForm — docs/13 面 D#5/#9/#32-#38/#41 的 portal 块级装配（详情操作区渲染）：
 *
 * - 绑定链：节点 config.approvalUid（面 F #29 契约键）→ flowModels 树 →
 *   ProcessFormModel 族（loadProcessFormTree）。节点未配置审批界面时按批2 轻量通道
 *   （仅意见弹窗，data={}，与 v2 轻量原型 index.jsx:543 withData 一致）——单通道实现，
 *   无并存两套；
 * - pattern 状态机（D#5）：record 含 status 键 → pending?edit:details；操作区仅在
 *   edit（PENDING）渲染（D#34 isRuntimeVisible 等价）；
 * - 表单渲染（D#13/#16-#23）：统一渲染器 edit 模式 + 快照/最新策略打底（D#9 merged=
 *   snapshot∪dataBefore∪dataAfter，recordShowMode 时 approval.data 优先；D#7
 *   shouldReload 时拉最新记录叠盖）；
 * - 提交链（D#38）：通过/拒绝/退回点击先跑必填校验（skipRequiredValidation 步骤参数
 *   可跳，D#26）再开确认弹窗；提交 values={comment(jsonb {text}),status,data} +
 *   appends（策略 appends）+ updateAssociationValues（关联字段计算）——与 v2
 *   `recordsResource('submit'|'return')({filterByTk, updateAssociationValues, appends,
 *   values:{…commentValues,status,data}})`（:1449-1454）对齐；
 * - 委派/加签（D#39/#40）不走表单校验（v2 reassignClickFlow 无 validateActionForm）；
 * - 评论表单（D#41-#42）：commentModelUid 持久化通道为 flow-engine 配置态设施，portal
 *   以静态意见 Textarea（rows 4，官方 autoSize minRows）+ jsonb {text} 语义等价承接。
 */

/** 节点 config.actions 缺省兜底（v2 index.jsx:533 克隆自设兜底）与数字→动作映射。 */
const FALLBACK_ACTION_STATUS: Array<{ status: number; kind: FormActionKind }> = [
  { status: 2, kind: "approve" },
  { status: -1, kind: "reject" },
  { status: 1, kind: "return" },
  { status: 8, kind: "delegate" },
  { status: 99, kind: "addAssignee" },
];

const COMMENT_KINDS: FormActionKind[] = ["approve", "reject", "return"];

interface ResolvedAction {
  kind: FormActionKind;
  status: number;
  skipRequiredValidation: boolean;
}

export function ProcessFormActions({
  detail,
  onActionsChange,
}: {
  detail: ApprovalRecordRow | null;
  /** 批10：按钮组上报——详情 Sheet 把动作按钮渲染到固定底栏（官方「编辑用户」
   *  抽屉形态：按钮独立于表单、border-t 分栏、不随内容滚动）。缺省=就地渲染。 */
  onActionsChange?: (node: React.ReactNode | null) => void;
}) {
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [active, setActive] = useState<FormActionKind | null>(null);
  const [busy, setBusy] = useState(false);

  // B-22/D#34 运行态守卫：仅 PENDING(0) 可操作；ASSIGNED(null) 亦隐藏
  const enabled =
    !!detail &&
    detail.id != null &&
    hasStatus(detail) &&
    isRecordPending(detail.status);
  const workflow: ApprovalWorkflow | null | undefined =
    detail?.workflow ?? detail?.approval?.workflow ?? null;
  const approvalUid =
    detail?.node?.config && typeof detail.node.config.approvalUid === "string"
      ? (detail.node.config.approvalUid as string)
      : undefined;

  const treeQuery = useQuery({
    queryKey: approvalKeys.formTree(approvalUid ?? ""),
    enabled: enabled && !!approvalUid,
    queryFn: () => loadProcessFormTree(approvalUid as string, workflow),
    staleTime: 60_000,
  });
  const tree = treeQuery.data ?? null;
  const { resolveField } = useFormFieldMeta(tree?.fields ?? []);

  const collectionName =
    tree?.collectionName ?? workflow?.config?.collection ?? undefined;
  const strategy = useMemo(
    () =>
      processFormStrategy({
        workflow,
        approval: detail?.approval ?? null,
        record: detail ?? undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow?.id, detail?.id, detail?.status]
  );
  const recordQuery = useQuery({
    queryKey: approvalKeys.formRecord(collectionName ?? "", strategy.filterByTk ?? ""),
    enabled:
      enabled &&
      !!collectionName &&
      strategy.filterByTk != null &&
      strategy.shouldReload,
    queryFn: () => fetchFormRecord(collectionName as string, strategy),
    staleTime: 15_000,
  });
  const mergedValues = useMemo(
    () => mergeFormValues(strategy, recordQuery.data),
    [strategy, recordQuery.data]
  );
  useEffect(() => {
    setValues(mergedValues);
  }, [mergedValues]);

  // —— 纯计算段（无 hooks）：detail 为空时按空配置推导，早退渲染也保持稳定 ——
  const recordId: string | number = detail?.id ?? "";
  const nodeConfig = detail?.node?.config ?? {};

  // D#32 动作清单：树内配置动作优先（ProcessForm*Model 行），缺省回退节点 config.actions
  const configured: ResolvedAction[] = (tree?.actions ?? [])
    .filter((action) => FALLBACK_ACTION_STATUS.some((item) => item.kind === action.kind))
    .map((action) => ({
      kind: action.kind,
      status: FALLBACK_ACTION_STATUS.find((item) => item.kind === action.kind)!.status,
      skipRequiredValidation: action.skipRequiredValidation,
    }));
  const fallback: ResolvedAction[] = (() => {
    const actions = Array.isArray(nodeConfig.actions)
      ? nodeConfig.actions.map(Number)
      : FALLBACK_ACTION_STATUS.map((item) => item.status);
    return FALLBACK_ACTION_STATUS.filter((item) => actions.includes(item.status)).map(
      (item) => ({ ...item, skipRequiredValidation: false })
    );
  })();
  const resolvedActions = configured.length ? configured : fallback;

  const returnNodes = detail
    ? buildReturnNodes(
        detail,
        translate("approval.actions.applicantRestart", { ns: "app" }, "Applicant (restart)")
      )
    : [];
  const orderVisible = nodeConfig.order === true; // reassignClickFlow :1598
  const orderDisabled = !nodeConfig.negotiation; // :1599（Or=0 时禁用）

  // 成功/失败闭环（:1456-1462 / :1626-1632）：markApprovalsDirty 等价 = invalidate all
  const finish = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      toast.success(
        translate("approval.apply.submitted", { ns: "app" }, "Submitted successfully")
      );
      setActive(null);
      invalidateApprovalQueriesAfterWrite(queryClient);
    } catch (error) {
      toast.error(
        (error instanceof Error && error.message) ||
          translate("approval.apply.submitFailed", { ns: "app" }, "Submitted failed")
      );
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = (kind: FormActionKind) =>
    translate(
      kind === "approve"
        ? "approval.actions.approve"
        : kind === "reject"
          ? "approval.actions.reject"
          : kind === "return"
            ? "approval.actions.return"
            : kind === "delegate"
              ? "approval.actions.delegate"
              : "approval.actions.addAssignee",
      { ns: "app" },
      kind === "approve"
        ? "Approve"
        : kind === "reject"
          ? "Reject"
          : kind === "return"
            ? "Return"
            : kind === "delegate"
              ? "Delegate"
              : "Add assignee"
    );

  /** D#38 handler 前置 validateActionForm（:1391-1394）：失败中断不开弹窗。 */
  const openAction = (action: ResolvedAction) => {
    if (COMMENT_KINDS.includes(action.kind) && !action.skipRequiredValidation && tree?.fields.length) {
      const nextErrors = validateFormFields(tree.fields, resolveField, values);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;
    }
    setErrors({});
    setActive(action.kind);
  };
  // 按钮节点经 onActionsChange 上报到底栏；openAction 闭包随 values/errors 每渲染
  // 变化——经 ref 取最新，保证校验读到当前表单值。
  // ⚠ hooks 纪律：useRef/useMemo/useEffect 一律位于早退 return 之前——同一实例跨
  //   enabled 翻转（骨架→详情、待处理→已通过的 lastTarget 冻结复用）时 hooks 计数
  //   变化会触发 React #300/#310 整页崩（2026-10-22 批13 走查实录）。
  const openActionRef = useRef(openAction);
  openActionRef.current = openAction;
  const actionsKey = resolvedActions
    .map((action) => `${action.kind}:${action.skipRequiredValidation ? 1 : 0}`)
    .join("|");
  const buttonsNode = useMemo(
    () => (
      <>
        {resolvedActions.map((action) => (
          <Button
            key={action.kind}
            size="sm"
            variant={ACTION_PRESENTATION[action.kind].variant}
            disabled={busy}
            onClick={() => openActionRef.current(action)}
          >
            {actionLabel(action.kind)}
          </Button>
        ))}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionsKey, busy]
  );
  const hasActions = enabled && resolvedActions.length > 0;
  useEffect(() => {
    if (!onActionsChange) return;
    onActionsChange(hasActions ? buttonsNode : null);
    return () => onActionsChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, buttonsNode, hasActions]);

  // —— 早退：所有 hooks 之后 ——
  if (!enabled || !detail || detail.id == null) return null;
  if (!resolvedActions.length) return null;

  const submitCommentAction = async (kind: CommentKind, comment: string, returnToNodeKey?: string) => {
    const commentValue = comment ? { text: comment } : undefined;
    const data = buildFormData(tree?.fields ?? [], values);
    const updateAssociationValues = computeUpdateAssociationValues(
      tree?.fields ?? [],
      resolveField,
      values
    );
    const appends = strategy.shouldReload ? strategy.appends : [];
    if (kind === "return") {
      await finish(() =>
        returnApprovalRecord({
          filterByTk: recordId,
          comment: commentValue,
          returnToNodeKey,
          data,
          appends,
          updateAssociationValues,
        })
      );
    } else {
      await finish(() =>
        submitApprovalRecord({
          filterByTk: recordId,
          status: kind === "approve" ? 2 : -1,
          comment: commentValue,
          data,
          appends,
          updateAssociationValues,
        })
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 批7 布局照官方表单示例（ui-builder 表单对话框）：字段全宽直排，
          动作按钮组收在表单右下——不再用 Card 包裹、不再做顶部按钮条。 */}
      {tree && tree.fields.length ? (
        <FormFieldsRenderer
          fields={tree.fields}
          resolveField={resolveField}
          values={values}
          errors={errors}
          disabled={busy}
          idPrefix="approval-process-form"
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
      ) : null}

      {onActionsChange ? null : (
        <div
          role="toolbar"
          aria-label={translate("approval.actions.operationArea", { ns: "app" }, "Approval actions")}
          className="flex flex-wrap items-center justify-end gap-2"
        >
          {resolvedActions.map((action) => (
            <Button
              key={action.kind}
              size="sm"
              variant={ACTION_PRESENTATION[action.kind].variant}
              disabled={busy}
              onClick={() => openAction(action)}
            >
              {actionLabel(action.kind)}
            </Button>
          ))}
        </div>
      )}

      {active && COMMENT_KINDS.includes(active) ? (
        <CommentActionDialog
          key={active}
          open
          kind={active as CommentKind}
          busy={busy}
          returnNodes={active === "return" ? returnNodes : []}
          onClose={() => setActive(null)}
          onSubmit={(comment, returnToNodeKey) =>
            submitCommentAction(active as CommentKind, comment, returnToNodeKey)
          }
        />
      ) : null}

      {active === "delegate" || active === "addAssignee" ? (
        <ReassignActionDialog
          key={active}
          open
          recordId={recordId}
          type={active === "addAssignee" ? "toAdd" : "toDelegate"}
          multiple={active === "addAssignee"}
          extraFieldKey={
            (active === "addAssignee"
              ? nodeConfig.toAddReassigneesOptions
              : nodeConfig.toDelegateReassigneesOptions
            )?.extraFieldKey ?? undefined
          }
          orderVisible={orderVisible}
          orderDisabled={orderDisabled}
          busy={busy}
          onClose={() => setActive(null)}
          onSubmit={async (assignee, order) => {
            if (active === "addAssignee") {
              await finish(() =>
                addApprovalRecordAssignees({
                  filterByTk: recordId,
                  assignee,
                  ...(orderVisible ? { order } : {}), // order 仅显示时提交（:1622-1625）
                })
              );
            } else {
              await finish(() =>
                delegateApprovalRecord({
                  filterByTk: recordId,
                  assignee: assignee[0],
                })
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------ D#5 details 模式只读快照渲染

/**
 * details 模式快照渲染（D#17/#19 Display 族 portal 等价）：节点配置了审批界面时，
 * 按表单树配置字段只读渲染快照数据（baseValues ∪ 最新记录）；未配置 / 非配置界面树 /
 * 树无字段时渲染 fallback（调用方传批2 BusinessRecordCard，C 面契约不变——本组件不反向
 * 依赖 detail-cards，避免环形引用）。
 */
export function ProcessFormSnapshot({
  detail,
  head = false,
  fallback,
}: {
  detail: ApprovalRecordRow | null;
  head?: boolean;
  fallback: ReactNode;
}) {
  const translate = useTranslate();
  const workflow: ApprovalWorkflow | null | undefined =
    detail?.workflow ?? detail?.approval?.workflow ?? null;
  const approvalUid =
    detail?.node?.config && typeof detail.node.config.approvalUid === "string"
      ? (detail.node.config.approvalUid as string)
      : undefined;
  const detailsPattern =
    !!detail && hasStatus(detail) && !isRecordPending(detail.status);

  const treeQuery = useQuery({
    queryKey: approvalKeys.formTree(approvalUid ?? ""),
    enabled: detailsPattern && !!approvalUid,
    queryFn: () => loadProcessFormTree(approvalUid as string, workflow),
    staleTime: 60_000,
  });
  const tree = treeQuery.data ?? null;
  const { resolveField } = useFormFieldMeta(tree?.fields ?? []);
  const collectionName = tree?.collectionName ?? workflow?.config?.collection ?? undefined;
  const strategy = useMemo(
    () =>
      processFormStrategy({
        workflow,
        approval: detail?.approval ?? null,
        record: detail ?? undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow?.id, detail?.id, detail?.status]
  );
  const recordQuery = useQuery({
    queryKey: approvalKeys.formRecord(collectionName ?? "", strategy.filterByTk ?? ""),
    enabled:
      detailsPattern &&
      !!collectionName &&
      strategy.filterByTk != null &&
      strategy.shouldReload,
    queryFn: () => fetchFormRecord(collectionName as string, strategy),
    staleTime: 15_000,
  });
  const mergedValues = useMemo(
    () => mergeFormValues(strategy, recordQuery.data),
    [strategy, recordQuery.data]
  );

  // 未配置 / 非配置界面树 / 树无字段 → 回落业务卡（C 面契约，由调用方传入）
  if (!detailsPattern || !approvalUid || !tree || !tree.fields.length) {
    return <>{fallback}</>;
  }
  return (
    <Card className="gap-3 py-3">
      {head ? (
        <CardHeader className="px-3 py-0">
          <CardTitle className="text-sm">
            {translate(
              "approval.detail.originalContent",
              { ns: "app" },
              "Original application content"
            )}
          </CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-3.5 px-3">
        {treeQuery.isPending || (recordQuery.isPending && recordQuery.fetchStatus !== "idle") ? (
          <div className="flex justify-center py-3">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : (
          <FormFieldsRenderer
            fields={tree.fields}
            resolveField={resolveField}
            values={mergedValues}
            readOnly
            idPrefix="approval-process-snapshot"
          />
        )}
      </CardContent>
    </Card>
  );
}
