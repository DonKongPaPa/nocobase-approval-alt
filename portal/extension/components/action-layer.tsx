import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 批18：动作层抽屉 —— 详情 RouteDrawer 之上的**第二层抽屉**（用户裁决：
 * 五操作/编辑重提「再弹一个抽屉」，返回的层级关系要理解好——返回键/滑动
 * 先关动作层、回到详情抽屉，而不是全屏弹窗一刀切）。
 *
 * - 层叠：Portal z-[60] 盖过详情抽屉（z-50）；Backdrop 照 RouteDrawerBackdrop
 *   的写法 `onClick stopPropagation`——base-ui 在 pointerdown 即关闭弹层，
 *   不拦 click 的话卸载后同一点击会落在新暴露的元素上（批18 透传根因：
 *   确认弹窗点遮罩/确定后原地重开底栏按钮）。
 * - 返回键：open 时压入一条同 URL history state，popstate → 关动作层；
 *   关闭后浏览器返回才退出详情路由（逐层返回）。
 * - 形态：<sm 全屏（同详情抽屉），sm+ 右侧 520px 层叠抽屉（全高、圆角左缘）。
 * - 语义：children=滚动区表单字段；footer=钉底按钮行（可空）。
 */
export function ActionLayer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // 返回键逐层关闭：open 时压栈，popstate 只关本层（不退出详情路由）
  useEffect(() => {
    if (!open) return;
    // 已有本层的栈位（快速重开）则不重复压
    if (history.state?.approvalActionLayer) return;
    history.pushState({ approvalActionLayer: true }, "");
    const onPop = () => onOpenChange(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 经 × / 滑动 / 编程关闭时清掉占位栈位，保持返回链干净
      if (history.state?.approvalActionLayer) history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection="right"
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          forceRender
          onClick={(event) => {
            // RouteDrawerBackdrop 同款：拦掉卸载后落到底层元素的点击（批18 透传根因），
            // 再显式关层
            event.stopPropagation();
            onOpenChange(false);
          }}
          className="pointer-events-auto fixed inset-0 isolate z-[60] bg-black/10 opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] select-none data-ending-style:pointer-events-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-xs"
        />
        <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-[60] select-none">
          <DrawerPrimitive.Popup
            className={cn(
              "pointer-events-auto absolute inset-y-0 right-0 flex w-full flex-col bg-popover text-sm text-popover-foreground shadow-xl transition-transform duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform outline-none",
              "sm:w-[520px] sm:rounded-l-xl",
              "data-ending-style:translate-x-full data-starting-style:translate-x-full data-swiping:duration-0"
            )}
          >
            <header className="relative shrink-0 border-b px-5 py-4 pr-14">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <DrawerPrimitive.Title className="font-heading truncate text-lg font-medium text-foreground">
                    {title}
                  </DrawerPrimitive.Title>
                  {description ? (
                    <DrawerPrimitive.Description className="text-sm text-balance text-muted-foreground">
                      {description}
                    </DrawerPrimitive.Description>
                  ) : null}
                </div>
              </div>
              <DrawerPrimitive.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-3 right-3"
                  />
                }
              >
                <X />
                <span className="sr-only">Close</span>
              </DrawerPrimitive.Close>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer ? (
              <div className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t px-5 py-4">
                {footer}
              </div>
            ) : null}
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
