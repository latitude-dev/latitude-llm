import { Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { getPrimaryLifecycleState } from "../../../../../../../components/signals/lifecycle-formatters.ts"
import { SignalLifecycleStatuses } from "../../../../../../../components/signals/signal-lifecycle-statuses.tsx"
import { useUserSignals } from "../../../../../../../domains/end-users/end-users.collection.ts"
import { formatAgoLabel } from "../../-components/user-formatters.ts"

export function UserSignalsSection({
  projectId,
  projectSlug,
  userId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly userId: string
}) {
  const { data: issues, isLoading } = useUserSignals({ projectId, userId })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="flex min-h-16 items-center">
        <Text.H6 color="foregroundMuted">No signals have been seen on this user's traces.</Text.H6>
      </div>
    )
  }

  return (
    <div className="-mx-2 flex max-h-[min(24rem,45vh)] flex-col overflow-y-auto px-2">
      {issues.map((issue) => {
        const primaryState = getPrimaryLifecycleState(issue.states)
        return (
          <Link
            key={issue.signalId}
            to="/projects/$projectSlug/signals/$signalSlug"
            params={{ projectSlug, signalSlug: issue.slug }}
            aria-label={`Open issue ${issue.name}`}
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-background"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Text.H5 className="min-w-0" noWrap ellipsis>
                {issue.name}
              </Text.H5>
              {issue.description ? (
                <Text.H6 color="foregroundMuted" className="min-w-0" noWrap ellipsis>
                  {issue.description}
                </Text.H6>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <SignalLifecycleStatuses states={primaryState ? [primaryState] : []} wrap={false} />
              <div className="flex w-24 flex-col items-end gap-0.5">
                <Text.H5 className="tabular-nums">{formatCount(issue.occurrences)}</Text.H5>
                <Text.H6 color="foregroundMuted">occurrences</Text.H6>
              </div>
              <div className="flex w-16 justify-end">
                <Text.H6 color="foregroundMuted" noWrap>
                  {formatAgoLabel(issue.lastSeenAt)}
                </Text.H6>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
