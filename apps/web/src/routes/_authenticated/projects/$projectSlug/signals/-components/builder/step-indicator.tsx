import { cn, Icon, Text } from "@repo/ui"
import { CheckIcon } from "lucide-react"

export interface StepIndicatorItem {
  readonly id: string
  readonly label: string
}

function StepMarker({ completed, current, index }: { completed: boolean; current: boolean; index: number }) {
  return (
    <span
      className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", {
        "bg-primary text-primary-foreground": completed || current,
        "bg-muted": !completed && !current,
      })}
    >
      {completed ? (
        <Icon icon={CheckIcon} size="xs" />
      ) : (
        <Text.H6 color={current ? "primaryForeground" : "foregroundMuted"}>{index + 1}</Text.H6>
      )}
    </span>
  )
}

function StepItem({
  item,
  index,
  activeIndex,
  isLast,
}: {
  item: StepIndicatorItem
  index: number
  activeIndex: number
  isLast: boolean
}) {
  const completed = index < activeIndex
  const current = index === activeIndex

  return (
    <li key={item.id} className="flex flex-1 items-center gap-1" aria-current={current ? "step" : undefined}>
      <div className="flex items-center gap-2 px-1.5 py-1">
        <StepMarker completed={completed} current={current} index={index} />
        <Text.H6 color={current ? "primary" : completed ? "foreground" : "foregroundMuted"} noWrap>
          {item.label}
        </Text.H6>
      </div>
      {!isLast ? <div className={cn("h-px flex-1", { "bg-primary": completed, "bg-border": !completed })} /> : null}
    </li>
  )
}

export function StepIndicator({
  steps,
  activeIndex,
}: {
  readonly steps: readonly StepIndicatorItem[]
  readonly activeIndex: number
}) {
  return (
    <ol className="flex items-center gap-1" aria-label="Signal creation progress">
      {steps.map((item, index) => (
        <StepItem
          key={item.id}
          item={item}
          index={index}
          activeIndex={activeIndex}
          isLast={index === steps.length - 1}
        />
      ))}
    </ol>
  )
}
