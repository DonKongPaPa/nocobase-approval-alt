// reui.io「Timeline」组件移植（registry: https://reui.io/r/timeline.json，
// base-nova 皮肤，目标 components/reui/timeline.tsx）。原实现基于
// @base-ui/react 的 useRender/mergeProps 组合委托，本扩展未消费 render 面，
// 退化为普通组件；className、data-slot、activeStep context 契约与 registry
// 逐字一致（tailwind v4 语法：translate-y-4.5 / has-[+]...:**: 双星变体）。
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ComponentProps,
} from "react";

import { cn } from "@/lib/utils";

// Types
type TimelineContextValue = {
  activeStep: number;
  setActiveStep: (step: number) => void;
};

// Context
const TimelineContext = createContext<TimelineContextValue | undefined>(
  undefined
);

function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimeline must be used within a Timeline");
  }
  return context;
}

// Components
export interface TimelineProps extends ComponentProps<"div"> {
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  orientation?: "horizontal" | "vertical";
}

function Timeline({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = "vertical",
  className,
  children,
  ...props
}: TimelineProps) {
  const [activeStep, setInternalStep] = useState(defaultValue);

  const setActiveStep = useCallback(
    (step: number) => {
      if (value === undefined) {
        setInternalStep(step);
      }
      onValueChange?.(step);
    },
    [value, onValueChange]
  );

  const currentStep = value ?? activeStep;

  return (
    <TimelineContext.Provider value={{ activeStep: currentStep, setActiveStep }}>
      <div
        data-orientation={orientation}
        data-slot="timeline"
        className={cn(
          "group/timeline flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  );
}

// TimelineContent
function TimelineContent({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="timeline-content"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// TimelineDate
export type TimelineDateProps = ComponentProps<"time">;

function TimelineDate({ className, children, ...props }: TimelineDateProps) {
  return (
    <time
      data-slot="timeline-date"
      className={cn(
        "mb-1 block font-medium text-muted-foreground text-xs group-data-[orientation=vertical]/timeline:max-sm:h-4",
        className
      )}
      {...props}
    >
      {children}
    </time>
  );
}

// TimelineHeader
function TimelineHeader({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="timeline-header" className={cn(className)} {...props}>
      {children}
    </div>
  );
}

// TimelineIndicator
export type TimelineIndicatorProps = ComponentProps<"div">;

function TimelineIndicator({ className, children, ...props }: TimelineIndicatorProps) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      data-slot="timeline-indicator"
      className={cn(
        "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute size-4 rounded-full border-2 border-primary/20 group-data-[orientation=vertical]/timeline:top-0 group-data-[orientation=horizontal]/timeline:left-0 group-data-completed/timeline-item:border-primary",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// TimelineItem
export interface TimelineItemProps extends ComponentProps<"div"> {
  step: number;
}

function TimelineItem({ step, className, children, ...props }: TimelineItemProps) {
  const { activeStep } = useTimeline();

  return (
    <div
      data-completed={step <= activeStep || undefined}
      data-slot="timeline-item"
      className={cn(
        "group/timeline-item relative flex flex-1 flex-col gap-0.5 group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=horizontal]/timeline:mt-8 group-data-[orientation=horizontal]/timeline:not-last:pe-8 group-data-[orientation=vertical]/timeline:not-last:pb-6 has-[+[data-completed]]:**:data-[slot=timeline-separator]:bg-primary",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// TimelineSeparator
function TimelineSeparator({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="timeline-separator"
      className={cn(
        "group-data-[orientation=horizontal]/timeline:-top-6 group-data-[orientation=horizontal]/timeline:-translate-y-1/2 group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:-translate-x-1/2 absolute self-start bg-primary/10 group-last/timeline-item:hidden group-data-[orientation=horizontal]/timeline:h-0.5 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem-0.25rem)] group-data-[orientation=horizontal]/timeline:w-[calc(100%-1rem-0.25rem)] group-data-[orientation=vertical]/timeline:w-0.5 group-data-[orientation=horizontal]/timeline:translate-x-4.5 group-data-[orientation=vertical]/timeline:translate-y-4.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// TimelineTitle
function TimelineTitle({ className, children, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="timeline-title"
      className={cn("font-medium text-sm", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
};
