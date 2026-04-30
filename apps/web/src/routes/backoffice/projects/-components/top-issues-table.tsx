import { Badge, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import type { AdminProjectMetricsDto } from "../../../../domains/admin/projects.functions.ts"

const STATE_LABEL: Record<AdminProjectMetricsDto["topIssues"][number]["state"], string> = {
  untracked: "untracked",
  tracked: "tracked",
  resolved: "resolved",
}

const STATE_VARIANT: Record<
  AdminProjectMetricsDto["topIssues"][number]["state"],
  "outlineWarningMuted" | "outlineAccent" | "outlineSuccessMuted"
> = {
  untracked: "outlineWarningMuted",
  tracked: "outlineAccent",
  resolved: "outlineSuccessMuted",
}

interface TopIssuesTableProps {
  readonly issues: AdminProjectMetricsDto["topIssues"]
}

export function TopIssuesTable({ issues }: TopIssuesTableProps) {
  if (issues.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center">
        <Text.H6 color="foregroundMuted">No issues with occurrences in this window.</Text.H6>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {issues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <Text.H5 weight="medium" ellipsis noWrap>
              {issue.name}
            </Text.H5>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              last seen {relativeTime(issue.lastSeenAt)}
            </Text.H6>
          </div>
          <Badge variant={STATE_VARIANT[issue.state]}>{STATE_LABEL[issue.state]}</Badge>
          <div className="flex flex-col items-end leading-tight">
            <Text.H5 weight="semibold">
              <span className="tabular-nums">{formatCount(issue.occurrences)}</span>
            </Text.H5>
            <Text.H6 color="foregroundMuted">occurrences</Text.H6>
          </div>
        </div>
      ))}
    </div>
  )
}
