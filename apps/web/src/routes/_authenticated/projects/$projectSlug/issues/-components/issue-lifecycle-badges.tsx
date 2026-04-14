import { Badge, Tooltip } from "@repo/ui"
import type { ComponentProps, ReactNode } from "react"
import { formatLifecycleLabel, getLifecycleStatesForDisplay } from "./issue-formatters.ts"

const STATE_VARIANTS = {
  new: "outlineAccent",
  escalating: "outlineWarningMuted",
  resolved: "outlineMuted",
  regressed: "outlineDestructiveMuted",
  ignored: "outlineMuted",
} as const

interface IssueExtraBadge {
  readonly key: string
  readonly label: string
  readonly variant?: ComponentProps<typeof Badge>["variant"]
  readonly tooltip?: ReactNode
}

export function IssueLifecycleBadges({
  states,
  wrap = true,
  extraBadges = [],
}: {
  readonly states: readonly string[]
  readonly wrap?: boolean
  readonly extraBadges?: readonly IssueExtraBadge[]
}) {
  if (states.length === 0 && extraBadges.length === 0) {
    return null
  }

  const orderedStates = getLifecycleStatesForDisplay(states)

  return (
    <div className={wrap ? "flex flex-row flex-wrap gap-1" : "flex flex-row gap-1"}>
      {orderedStates.map((state) => (
        <Badge
          key={state}
          variant={STATE_VARIANTS[state as keyof typeof STATE_VARIANTS] ?? "outline"}
          size="small"
          noWrap
        >
          {formatLifecycleLabel(state)}
        </Badge>
      ))}
      {extraBadges.map((badge) => {
        const badgeElement = (
          <Badge key={badge.key} variant={badge.variant ?? "outline"} size="small" noWrap>
            {badge.label}
          </Badge>
        )

        if (!badge.tooltip) {
          return badgeElement
        }

        return (
          <Tooltip asChild key={badge.key} trigger={<span className="inline-flex">{badgeElement}</span>}>
            {badge.tooltip}
          </Tooltip>
        )
      })}
    </div>
  )
}
