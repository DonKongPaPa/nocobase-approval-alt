import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { listReassignees, type ApprovalRecordRow, type ReassigneeUser } from "../api";
import { approvalKeys } from "../query-keys";
import { ActionLayer } from "./action-layer";

/**
 * 待办操作弹窗库 — docs/13 面 B 五操作（B-22~B-27）与面 D#34/#38/#39/#40 共用：
 *
 * - 通过/拒绝/退回确认弹窗（CommentActionDialog）：不可撤销警示（commentFormModelOptions
 *   :735-741 官方措辞）+ 意见 Textarea（jsonb {text} 对象语义提交）+ 退回
 *   returnToNodeKey Select（returnNodesFor :1123-1136；单选项 disabled、默认取第一项）；
 * - 委派/加签选人弹窗（ReassignActionDialog）：远程搜索候选人
 *   approvalRecords.reassignees/<id>:list {type, pageSize:200, filter}，搜索词
 *   nickname/username $includes、300ms 防抖（:1483-1495）；delegate 单选 / add 多选
 *   + order 在我之前(-1)/在我之后(1)（:1529-1540）。
 *
 * 批3：动作按钮与表单装配迁至 process-form.tsx（ProcessFormActions，D#32 顶层块），
 * 本文件保留两弹窗与退回候选节点推导，供 ProcessFormActions 与后续消费端复用。
 */

export type CommentKind = "approve" | "reject" | "return";
export type ActionKind = CommentKind | "delegate" | "add";

/** 退回候选节点选项（value = 节点 key，'0' = 发起人重新提交）。 */
export interface ReturnNodeOption {
  label: string;
  value: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strVal = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : undefined;
const sameStr = (a: unknown, b: unknown): boolean => {
  const x = strVal(a);
  return x !== undefined && x === strVal(b);
};
const objArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(isObj) : [];

/**
 * 上游审批节点链（walkUpstreamApprovalNodes :1138-1149 的 portal 等价）：
 * workflow.nodes 为 flow_nodes 行（含 upstreamId），沿链回溯收集 type==='approval' 节点，
 * value = key ?? id（approvalNodeOptions :896-899）。
 */
function collectUpstreamApprovalOptions(
  nodes: Record<string, unknown>[],
  currentNodeId: unknown
): ReturnNodeOption[] {
  const byId = new Map(nodes.map((node) => [strVal(node.id) ?? "", node]));
  const options: ReturnNodeOption[] = [];
  let current = byId.get(strVal(currentNodeId) ?? "");
  let guard = 0;
  while (current && guard < 200) {
    const upId = current.upstreamId ?? (isObj(current.upstream) ? current.upstream.id : undefined);
    if (upId == null) break;
    const up = byId.get(strVal(upId) ?? "");
    if (!up) break;
    if (up.type === "approval") {
      const value = strVal(up.key) ?? strVal(up.id);
      if (value != null) {
        options.push({ label: strVal(up.title) ?? value, value });
      }
    }
    current = up;
  }
  return options;
}

/** returnNodesFor（:1123-1136）逐条对照：-1 全部上游+发起人 / 正数最近 N（不足补发起人）/ 字符串指定节点。 */
export function buildReturnNodes(
  detail: ApprovalRecordRow,
  applicantLabel: string
): ReturnNodeOption[] {
  const nodes = objArray(
    detail.workflow?.nodes ?? detail.approval?.workflow?.nodes
  );
  let upstreamOptions = collectUpstreamApprovalOptions(nodes, detail.nodeId);
  if (!upstreamOptions.length) {
    // 上游链不可得时按 v2 轻量原型兜底（index.jsx:556-559）：除当前节点外全部审批节点
    upstreamOptions = nodes
      .filter(
        (node) =>
          node.type === "approval" && !sameStr(node.id, detail.nodeId)
      )
      .map((node) => {
        const value = strVal(node.key) ?? strVal(node.id) ?? "";
        return { value, label: strVal(node.title) ?? value };
      })
      .filter((option) => option.value !== "");
  }
  const returnTo = detail.node?.config?.returnTo;
  const startNode: ReturnNodeOption = { label: applicantLabel, value: "0" };
  if (returnTo === -1) return upstreamOptions.concat(startNode);
  if (typeof returnTo === "number" && returnTo > 0) {
    const slice = upstreamOptions.slice(0, returnTo);
    return returnTo > upstreamOptions.length ? slice.concat(startNode) : slice;
  }
  if (typeof returnTo === "string" && returnTo) {
    const found = upstreamOptions.find((option) => option.value === returnTo);
    return found ? [found] : [];
  }
  // 无配置（Applicant restart 默认态）→ 无候选，退回不携带 returnToNodeKey（整轮重开）
  return [];
}

// ------------------------------------------------- 通过/拒绝/退回 确认弹窗

export function CommentActionDialog({
  open,
  kind,
  busy,
  returnNodes,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: CommentKind;
  busy: boolean;
  returnNodes: ReturnNodeOption[];
  onClose: () => void;
  onSubmit: (comment: string, returnToNodeKey?: string) => void | Promise<void>;
}) {
  const translate = useTranslate();
  const [comment, setComment] = useState("");
  const [returnToNodeKey, setReturnToNodeKey] = useState<string | undefined>(
    () => returnNodes[0]?.value
  );
  const [returnError, setReturnError] = useState(false);

  // 打开即重置（v2 onOk 成功后 resetFields :1458 的进入态等价）
  useEffect(() => {
    if (!open) return;
    setComment("");
    setReturnError(false);
    setReturnToNodeKey(returnNodes[0]?.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const titleKey =
    kind === "approve"
      ? "approval.actions.approve"
      : kind === "reject"
        ? "approval.actions.reject"
        : "approval.actions.return";
  const titleFallback = kind === "approve" ? "Approve" : kind === "reject" ? "Reject" : "Return";

  const submit = async () => {
    if (kind === "return" && returnNodes.length && returnToNodeKey == null) {
      setReturnError(true);
      return;
    }
    await onSubmit(comment.trim(), returnToNodeKey);
  };

  return (
    // 批18：动作层抽屉（详情抽屉之上的第二层，返回键逐层关闭；原 ActionDialog
    // 的 backdrop 透传——关闭后同点击落到底栏按钮原地重开——随层退役）
    <ActionLayer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={translate(titleKey, { ns: "app" }, titleFallback)}
      description={translate(
        "approval.actions.notRevocable",
        { ns: "app" },
        "This operation can not be revocated. Please confirm before submitting."
      )}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {translate("approval.actions.cancel", { ns: "app" }, "Cancel")}
          </Button>
          <Button
            variant={kind === "reject" ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {translate("approval.actions.confirmOk", { ns: "app" }, "OK")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="approval-action-comment">
            {translate("approval.actions.comment", { ns: "app" }, "Comment")}
          </Label>
          <Textarea
            id="approval-action-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
        {kind === "return" && returnNodes.length ? (
          <div className="space-y-1.5">
            <Label htmlFor="approval-action-return-to">
              {translate(
                "approval.actions.nodeToReturnTo",
                { ns: "app" },
                "Node to return to"
              )}
              <span className="ms-0.5 text-red-500">*</span>
            </Label>
            <Select
              value={returnToNodeKey ?? null}
              onValueChange={(value) => {
                setReturnToNodeKey(value == null ? undefined : String(value));
                setReturnError(false);
              }}
              items={returnNodes}
            >
              <SelectTrigger
                id="approval-action-return-to"
                className="w-full"
                disabled={returnNodes.length <= 1 /* :1117 单选 disabled */}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {returnNodes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {returnError ? (
              <p className="text-xs text-red-600">
                {translate(
                  "approval.actions.nodeToReturnTo",
                  { ns: "app" },
                  "Node to return to"
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ActionLayer>
  );
}

// --------------------------------------------------------- 委派/加签 选人弹窗

function reassigneeLabel(user: ReassigneeUser): string {
  return (
    user.nickname ||
    user.username ||
    user.email ||
    (user.id != null ? String(user.id) : "-")
  );
}

export function ReassignActionDialog({
  open,
  recordId,
  type,
  multiple,
  extraFieldKey,
  orderVisible,
  orderDisabled,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  recordId: string | number;
  type: "toDelegate" | "toAdd";
  multiple: boolean;
  extraFieldKey?: string;
  orderVisible: boolean;
  orderDisabled: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (assignee: number[], order: number) => void | Promise<void>;
}) {
  const translate = useTranslate();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [order, setOrder] = useState(-1); // 表单初值 order=-1（ReassignForm :1511）
  const [requiredError, setRequiredError] = useState(false);

  // 搜索 300ms 防抖（ahooks useRequest debounceWait:300 的等价实现，:1483-1495）
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: approvalKeys.reassignees(recordId, type, debounced.trim()),
    enabled: open,
    queryFn: () => listReassignees({ recordId, type, search: debounced }),
    staleTime: 15_000,
  });
  const users: ReassigneeUser[] = (() => {
    const data = query.data;
    if (Array.isArray(data)) return data as ReassigneeUser[];
    return data?.data ?? [];
  })();

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDebounced("");
    setSelected([]);
    setOrder(-1);
    setRequiredError(false);
  }, [open]);

  const toggle = (id: number, checked: boolean) => {
    setRequiredError(false);
    setSelected((prev) => {
      if (multiple) {
        return checked
          ? prev.includes(id)
            ? prev
            : [...prev, id]
          : prev.filter((value) => value !== id);
      }
      return checked ? [id] : [];
    });
  };

  const submit = async () => {
    if (!selected.length) {
      // ReassignForm rules required message t('Assignee')（:1516-1518）
      setRequiredError(true);
      return;
    }
    await onSubmit(selected, order);
  };

  return (
    // 批18：动作层抽屉（同 CommentActionDialog 的层退役理由）
    <ActionLayer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={translate(
        multiple ? "approval.actions.addAssignee" : "approval.actions.delegate",
        { ns: "app" },
        multiple ? "Add assignee" : "Delegate"
      )}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {translate("approval.actions.cancel", { ns: "app" }, "Cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {translate("approval.actions.confirmOk", { ns: "app" }, "OK")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="approval-action-assignee">
            {translate("approval.actions.assignee", { ns: "app" }, "Assignee")}
            <span className="ms-0.5 text-red-500">*</span>
          </Label>
          <Input
            id="approval-action-assignee"
            value={search}
            placeholder={translate(
              "approval.actions.selectAssignees",
              { ns: "app" },
              "Select assignees"
            )}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-56 overflow-y-auto rounded-md border p-1">
            {query.isFetching && !users.length ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : users.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {translate("approval.list.noData", { ns: "app" }, "No data yet")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {users.map((user) => {
                  const id = Number(user.id);
                  const checked = selected.includes(id);
                  const extra =
                    extraFieldKey && user[extraFieldKey] != null
                      ? String(user[extraFieldKey])
                      : null;
                  return (
                    <li key={id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                        {multiple ? (
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggle(id, value === true)}
                            aria-label={reassigneeLabel(user)}
                          />
                        ) : (
                          <RadioGroup
                            value={checked ? id : undefined}
                            onValueChange={(value) => {
                              if (value != null) toggle(Number(value), true);
                            }}
                            className="size-auto gap-0"
                          >
                            <RadioGroupItem value={id} aria-label={reassigneeLabel(user)} />
                          </RadioGroup>
                        )}
                        <span className="min-w-0 truncate">{reassigneeLabel(user)}</span>
                        {/* extraFieldKey 无边框 Tag（:1499-1507） */}
                        {extra ? (
                          <Badge
                            variant="outline"
                            className="ms-auto shrink-0 border-transparent bg-muted font-normal"
                          >
                            {extra}
                          </Badge>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {requiredError ? (
            <p className="text-xs text-red-600">
              {translate(
                "approval.actions.assigneeRequired",
                { ns: "app" },
                "Assignee is required."
              )}
            </p>
          ) : null}
        </div>
        {orderVisible ? (
          <div className="space-y-1.5">
            <Label>{translate("approval.actions.addOrder", { ns: "app" }, "Add Order")}</Label>
            <RadioGroup
              value={order}
              onValueChange={(value) => setOrder(Number(value))}
              className="flex-row gap-4"
              disabled={orderDisabled || busy}
            >
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <RadioGroupItem value={-1} disabled={orderDisabled || busy} />
                {translate("approval.actions.beforeMe", { ns: "app" }, "Before Me")}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <RadioGroupItem value={1} disabled={orderDisabled || busy} />
                {translate("approval.actions.afterMe", { ns: "app" }, "After Me")}
              </label>
            </RadioGroup>
          </div>
        ) : null}
      </div>
    </ActionLayer>
  );
}
