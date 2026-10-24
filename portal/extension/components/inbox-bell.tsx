import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useTranslate } from "@refinedev/core";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  countUnreadInAppMessages,
  listMyInAppMessages,
  markAllInAppMessagesRead,
  markInAppMessageRead,
  type InAppMessageRow,
} from "../api";
import { approvalRoutes } from "../routes";

/**
 * 批14 右上角收信箱：真实数据驱动（notification-manager 的 in-app 消息管线，
 * 审批 todo/done 通知经 plugin-workflow-approval server/notifications.js 落库）。
 *
 * 挂载：AI portal header 右上角无扩展槽位——createPortal 注入 header 右侧控件区
 * （header 最后一个子 div 即 Settings/主题/头像簇），找不到时兜底 fixed 右上定位。
 * 未读角标 15s 轮询（todos-badge 同节奏）；面板列出最近 20 条，点条目 = 标已读 +
 * 跳转（标题含「任务/todo」→ 待办页，否则我的申请页），「全部已读」走
 * updateMyOwn {status:unread→read}。时间戳展示用相对时间，超过一天回落日期。
 */

const INBOX_KEYS = {
  unread: ["approval-inbox", "unread"] as const,
  list: ["approval-inbox", "list"] as const,
};

function relativeTime(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "<1m";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(value).toLocaleDateString();
}

export function InboxBell() {
  const translate = useTranslate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [fallbackFixed, setFallbackFixed] = useState(false);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // header 右侧控件区注入：SPA 渲染时序不定，轮询直到命中；多次未果走 fixed 兜底
  useEffect(() => {
    let timer = 0;
    let tries = 0;
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const controls = document.querySelector("header")?.lastElementChild;
      if (controls instanceof HTMLElement) {
        const el = document.createElement("div");
        controls.prepend(el);
        setHost(el);
        return;
      }
      tries += 1;
      if (tries >= 10) {
        const el = document.createElement("div");
        document.body.appendChild(el);
        setHost(el);
        setFallbackFixed(true);
        return;
      }
      timer = window.setTimeout(attach, 500);
    };
    attach();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unreadQuery = useQuery({
    queryKey: INBOX_KEYS.unread,
    queryFn: countUnreadInAppMessages,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const listQuery = useQuery({
    queryKey: INBOX_KEYS.list,
    queryFn: () => listMyInAppMessages(20),
    enabled: open,
    staleTime: 5_000,
  });
  const unread = unreadQuery.data ?? 0;
  const messages = listQuery.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: INBOX_KEYS.unread });
    void queryClient.invalidateQueries({ queryKey: INBOX_KEYS.list });
  };

  const openMessage = async (message: InAppMessageRow) => {
    setOpen(false);
    if (message.status === "unread") {
      try {
        await markInAppMessageRead(message.id);
      } catch {
        // 已读失败不拦跳转
      }
      refresh();
    }
    // 审批 todo 消息标题带「任务」/ todo；done 消息是结果通报 → 各归其页
    const isTodo = /任务|todo/i.test(message.title ?? "");
    navigate(isTodo ? approvalRoutes.todos : approvalRoutes.applications);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllInAppMessagesRead();
      refresh();
    } finally {
      setMarkingAll(false);
    }
  };

  if (!host) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={cn("relative", fallbackFixed && "fixed top-4 right-4 z-[1000]")}
    >
      <Button
        size="icon"
        variant="outline"
        className="relative size-10 rounded-xl border-border/70 bg-background/60"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={translate("approval.inbox.title", { ns: "app" }, "Inbox")}
        title={translate("approval.inbox.title", { ns: "app" }, "Inbox")}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 top-12 z-[1001] flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">
              {translate("approval.inbox.title", { ns: "app" }, "Inbox")}
              {unread > 0 ? (
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {unread} {translate("approval.inbox.unreadSuffix", { ns: "app" }, "unread")}
                </span>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={unread === 0 || markingAll}
              onClick={markAll}
            >
              {translate("approval.inbox.markAll", { ns: "app" }, "Mark all read")}
            </Button>
          </div>
          <div className="min-h-16 flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">…</div>
            ) : messages.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {translate("approval.inbox.empty", { ns: "app" }, "No messages")}
              </div>
            ) : (
              messages.map((message) => {
                const isUnread = message.status === "unread";
                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => openMessage(message)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                      isUnread && "bg-primary/[0.04]"
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {isUnread ? (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-1.5 size-1.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {message.title || "—"}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {relativeTime(message.receiveTimestamp ?? message.createdAt)}
                      </span>
                    </span>
                    {message.content ? (
                      <span className="line-clamp-3 ps-3.5 text-xs whitespace-pre-line text-muted-foreground">
                        {message.content}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>,
    host
  );
}
