import { Badge, Tooltip } from "@repo/ui"
import type { ComponentProps, ReactNode } from "react"
import { formatLifecycleLabel } from "./issue-formatters.ts"

const STATE_VARIANTS = {
  new: "outlineSuccessMuted",
  escalating: "outlineDestructiveMuted",
  resolved: "outlineMuted",
  regressed: "outlineWarningMuted",
  ignored: "outlineAccent",
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

  return (
    <div className={wrap ? "flex flex-row flex-wrap gap-1" : "flex flex-row gap-1"}>
      {states.map((state) => (
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
