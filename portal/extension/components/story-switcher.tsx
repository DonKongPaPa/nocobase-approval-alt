import { useEffect, useState } from "react";
import { useGetIdentity, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { Loader2, UserCog, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { clearAcl } from "@nocobase/portal-sdk/acl";

const STORAGE_FLAG = "approval-story-mode";

/**
 * 故事模式一键切换账号（验收辅助件，默认隐藏）。
 *
 * 门控：URL 带 ?story=1 时点亮并持久化到 localStorage；「退出故事模式」清除。
 * 切换契约复刻宿主 dingtalk auto-login-provider 的已验证路径：
 *   auth:signIn(basic) → setAuthenticator → setToken → setRole → clearAcl → 整页刷新。
 * 角色必须显式双写（storage + nb_role_main cookie）：同源的 v3 设置页（旧版 admin SPA）
 * 会把上一个账号的角色留在 cookie 里，而 getRole() 在存储为空时回退读 cookie，
 * 残留 root/admin 会以新用户 token 发出 X-Role → ROLE_NOT_FOUND_FOR_USER 踢回登录页。
 */
const STORY_ACCOUNTS = [
  {
    username: "admin@nocobase.com",
    nickname: "管理员",
    note: "admin",
    role: "root",
  },
  {
    username: "zhangsan",
    nickname: "张三",
    note: "研发工程师 · 申请人",
    role: "member",
  },
  {
    username: "lisi",
    nickname: "李四",
    note: "研发组长 · 一级审批",
    role: "member",
  },
  {
    username: "wangwu",
    nickname: "王五",
    note: "人事专员 · 二级审批 · 加签对象",
    role: "member",
  },
  {
    username: "zhaoliu",
    nickname: "赵六",
    note: "平级组长 · 转签对象",
    role: "member",
  },
] as const;

// 口令不入库：操作者在浏览器控制台一次性注入（?story=1 门控的验收辅助件，非产品功能）
//   localStorage.setItem("approval-story-credentials", JSON.stringify({
//     "admin@nocobase.com": "…", "zhangsan": "…", …}))
const storyCredentials = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("approval-story-credentials") ?? "{}");
  } catch {
    return {};
  }
};

export function StorySwitcher() {
  const translate = useTranslate();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const { data: identity } = useGetIdentity<{ username?: string | null }>();

  // ?story=1 点亮并持久化；此后纯靠 localStorage 维持（SPA 导航会丢 query）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("story") === "1") {
      localStorage.setItem(STORAGE_FLAG, "1");
    }
    setVisible(localStorage.getItem(STORAGE_FLAG) === "1");
  }, []);

  const exit = () => {
    localStorage.removeItem(STORAGE_FLAG);
    setVisible(false);
    setOpen(false);
  };

  const switchTo = async (account: (typeof STORY_ACCOUNTS)[number]) => {
    if (switching) return;
    setSwitching(account.username);
    try {
      const result = await nocobaseClient.action<{ token?: string }>(
        "auth",
        "signIn",
        { method: "POST", authenticator: "basic", body: { account: account.username, password: storyCredentials()[account.username] ?? "" } }
      );
      if (!result?.token) throw new Error("no token returned");
      nocobaseClient.setAuthenticator("basic");
      nocobaseClient.setToken(result.token);
      nocobaseClient.setRole(account.role);
      // cookie 同步覆盖：旧版设置页（同源）写入的 nb_role_main 是 getRole() 的回退源
      document.cookie = `nb_role_main=${account.role}; path=/`;
      clearAcl();
      // 保留当前路由整页刷新； Provider 重新引导后身份/角色/ACL 全部按新 token 重建
      window.location.replace(window.location.href);
    } catch (error) {
      setSwitching(null);
      toast.error(
        (error instanceof Error && error.message) ||
          translate("approval.story.switchFailed", { ns: "app" }, "Switch failed")
      );
    }
  };

  if (!visible) return null;

  const currentUsername = identity?.username ?? null;

  return (
    <div className="fixed right-4 bottom-4 z-[1000] flex flex-col items-end gap-2 print:hidden">
      {open ? (
        <div className="w-64 rounded-xl border bg-background p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {translate("approval.story.title", { ns: "app" }, "Story mode · switch account")}
            </span>
            <button
              type="button"
              onClick={exit}
              className="text-muted-foreground hover:text-foreground"
              title={translate("approval.story.exit", { ns: "app" }, "Exit story mode")}
            >
              <X className="size-3.5" />
            </button>
          </div>
          {STORY_ACCOUNTS.map((account) => {
            const isCurrent = currentUsername === account.username;
            const busy = switching === account.username;
            return (
              <button
                key={account.username}
                type="button"
                disabled={!!switching}
                onClick={() => switchTo(account)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-60",
                  isCurrent && "bg-muted/40"
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : account.nickname.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {account.nickname}
                    {isCurrent ? (
                      <span className="ms-1.5 text-[10px] font-normal text-primary">
                        {translate("approval.story.current", { ns: "app" }, "current")}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{account.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <Button
        size="icon"
        variant="outline"
        className="size-9 rounded-full border-border/70 bg-background/80 shadow-md opacity-70 hover:opacity-100"
        onClick={() => setOpen((prev) => !prev)}
        title={translate("approval.story.title", { ns: "app" }, "Story mode · switch account")}
      >
        <UserCog className="size-4" />
      </Button>
    </div>
  );
}
