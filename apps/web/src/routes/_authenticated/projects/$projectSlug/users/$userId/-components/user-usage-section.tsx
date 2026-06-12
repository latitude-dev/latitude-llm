import { Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useUserUsage } from "../../../../../../../domains/end-users/end-users.collection.ts"

function UsageList({
  projectId,
  userId,
  dimension,
  title,
}: {
  readonly projectId: string
  readonly userId: string
  readonly dimension: "model" | "provider" | "tool"
  readonly title: string
}) {
  const { data: slices, isLoading } = useUserUsage({ projectId, userId, dimension })
  const maxCount = Math.max(...(slices ?? []).map((slice) => slice.traceCount), 1)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg bg-secondary p-4">
      <Text.H6 color="foregroundMuted">{title}</Text.H6>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : !slices || slices.length === 0 ? (
        <Text.H6 color="foregroundMuted">-</Text.H6>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slices.map((slice) => (
            <div
              key={slice.value}
              className="relative flex items-center justify-between gap-2 overflow-hidden rounded px-1.5 py-0.5"
            >
              <span
                className="absolute inset-y-0 left-0 rounded bg-muted-foreground/10"
                style={{ width: `${Math.max((slice.traceCount / maxCount) * 100, 4)}%` }}
                aria-hidden
              />
              <Text.H6 className="relative min-w-0 font-mono" noWrap ellipsis>
                {slice.value}
              </Text.H6>
              <Text.H6 color="foregroundMuted" className="relative shrink-0 tabular-nums">
                {formatCount(slice.traceCount)}
              </Text.H6>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function UserUsageSection({ projectId, userId }: { readonly projectId: string; readonly userId: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <UsageList projectId={projectId} userId={userId} dimension="model" title="Models" />
      <UsageList projectId={projectId} userId={userId} dimension="provider" title="Providers" />
      <UsageList projectId={projectId} userId={userId} dimension="tool" title="Tools" />
    </div>
  )
}
