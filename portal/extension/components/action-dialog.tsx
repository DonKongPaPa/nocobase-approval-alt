import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 批7：审批动作弹窗专用 Dialog 原语——env ui/dialog 的逐行复刻，唯一实质差异是
 * Backdrop 传 forceRender。Base UI 对「在另一个 dialog 上层打开」的弹窗
 * （store.nested=true，React 树上处于 Sheet/Dialog 内）默认不渲染自己的 Backdrop
 * （DialogBackdrop `enabled: forceRender || !nested`），后果有二：
 *   ① 弹窗自身没有浅高斯遮罩（此前视觉借用的是 Sheet 的 z-50 遮罩）；
 *   ② modal 弹窗的点击关闭判定要求 target 是自己的 backdrop（useDialogRoot
 *      outsidePress：`internalBackdrop === target || backdrop === target`），
 *      没有 backdrop 时点模糊层永远关不掉——用户反馈「点击模糊层关闭模态框
 *      的逻辑没做」即此。
 * forceRender 让嵌套弹窗也渲染自己的 z-60 遮罩，遮罩视觉与点击关闭同时恢复
 * 官方行为；Sheet 本体保持 z-50 不再需要降层 hack。非嵌套场景下行为与
 * env ui/dialog 完全一致。
 */
/**
 * 批17：带输入框的弹窗移动端全屏化（用户裁决「有输入框的模态框应该变成
 * 全屏表单」）——<sm 时弹窗铺满视口、纵向滚动、footer 钉底（mt-auto）；
 * sm+ 保持居中卡片。表单类 Dialog（apply-new 发起表单 / apply-form 编辑
 * 重提）复用同一组类。
 */
export const FORM_DIALOG_MOBILE_FULLSCREEN =
  "max-sm:inset-0 max-sm:h-full max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:overflow-y-auto";

export function ActionDialog({
  open,
  onOpenChange,
  className,
  children,
  showCloseButton = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          forceRender
          className="fixed inset-0 isolate z-[60] bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="action-dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            FORM_DIALOG_MOBILE_FULLSCREEN,
            // 移动端全屏时纵向布局，footer（dialog-footer slot）钉底
            "max-sm:flex max-sm:flex-col max-sm:[&_[data-slot=dialog-footer]]:mt-auto",
            className
          )}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              data-slot="action-dialog-close"
              render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
