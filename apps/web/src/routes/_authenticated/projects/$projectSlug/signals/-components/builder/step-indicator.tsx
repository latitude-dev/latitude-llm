import { cn, Icon, Text } from "@repo/ui"
import { CheckIcon } from "lucide-react"

export interface StepIndicatorItem {
  readonly id: string
  readonly label: string
}

/**
 * Horizontal wizard step indicator. Completed steps show a check and are clickable
 * (jump back); the current step is highlighted; upcoming steps are muted. Forward
 * navigation stays on the Next button so step gating is preserved.
 */
export function StepIndicator({
  steps,
  activeIndex,
  onStepClick,
}: {
  readonly steps: readonly StepIndicatorItem[]
  readonly activeIndex: number
  readonly onStepClick?: (index: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((item, index) => {
        const done = index < activeIndex
        const current = index === activeIndex
        const clickable = done && onStepClick !== undefined
        return (
          <div key={item.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onStepClick(index) : undefined}
              className={cn("flex items-center gap-2 rounded-md px-1.5 py-1", {
                "cursor-pointer hover:bg-muted": clickable,
                "cursor-default": !clickable,
              })}
            >
              <span
                className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", {
                  "bg-primary text-primary-foreground": done || current,
                  "bg-muted": !done && !current,
                })}
              >
                {done ? (
                  <Icon icon={CheckIcon} size="xs" />
                ) : (
                  <Text.H6 color={current ? "primaryForeground" : "foregroundMuted"}>{index + 1}</Text.H6>
                )}
              </span>
              <Text.H6 color={current ? "primary" : done ? "foreground" : "foregroundMuted"} noWrap>
                {item.label}
              </Text.H6>
            </button>
            {index < steps.length - 1 ? (
              <div className={cn("h-px flex-1", { "bg-primary": done, "bg-border": !done })} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
