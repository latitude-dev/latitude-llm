import { Status, Tooltip } from "@repo/ui"
import type { ComponentProps, ReactNode } from "react"

import { formatLifecycleLabel } from "./issue-formatters.ts"

const STATE_VARIANTS = {
  new: "success",
  escalating: "destructive",
  resolved: "neutral",
  regressed: "warning",
  ignored: "info",
} as const satisfies Record<string, NonNullable<ComponentProps<typeof Status>["variant"]>>

interface IssueExtraStatus {
  readonly key: string
  readonly label: string
  readonly variant?: ComponentProps<typeof Status>["variant"]
  readonly tooltip?: ReactNode
}

export function IssueLifecycleStatuses({
  states,
  wrap = true,
  extraStatuses = [],
}: {
  readonly states: readonly string[]
  readonly wrap?: boolean
  readonly extraStatuses?: readonly IssueExtraStatus[]
}) {
  if (states.length === 0 && extraStatuses.length === 0) {
    return null
  }

  return (
    <div className={wrap ? "flex flex-row flex-wrap gap-1" : "flex flex-row gap-1"}>
      {states.map((state) => (
        <Status
          key={state}
          variant={STATE_VARIANTS[state as keyof typeof STATE_VARIANTS] ?? "neutral"}
          label={formatLifecycleLabel(state)}
        />
      ))}
      {extraStatuses.map((status) => {
        const statusElement = <Status key={status.key} variant={status.variant ?? "neutral"} label={status.label} />

        if (!status.tooltip) {
          return statusElement
        }

        return (
          <Tooltip asChild key={status.key} trigger={<span className="inline-flex">{statusElement}</span>}>
            {status.tooltip}
          </Tooltip>
        )
      })}
    </div>
  )
}
