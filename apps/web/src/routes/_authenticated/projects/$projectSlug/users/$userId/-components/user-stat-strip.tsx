import { Skeleton, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import type { UserProfileRecord } from "../../../../../../../domains/end-users/end-users.functions.ts"

function StatItem({
  label,
  value,
  isLoading,
  destructive = false,
}: {
  readonly label: string
  readonly value: string
  readonly isLoading: boolean
  readonly destructive?: boolean
}) {
  return (
    <div className="flex basis-[148px] min-w-[148px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <Text.H5 color={destructive ? "destructive" : "foreground"} className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

export function UserStatStrip({
  profile,
  isLoading,
}: {
  readonly profile: UserProfileRecord | null | undefined
  readonly isLoading: boolean
}) {
  const errorRate =
    profile && profile.sessionCount > 0
      ? `${Math.round((profile.errorSessionCount / profile.sessionCount) * 100)}%`
      : null

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <div className="relative min-w-0">
        <div className="flex flex-row gap-3 overflow-x-auto p-4">
          <StatItem label="Traces" value={formatCount(profile?.traceCount ?? 0)} isLoading={isLoading} />
          <StatItem label="Sessions" value={formatCount(profile?.sessionCount ?? 0)} isLoading={isLoading} />
          <StatItem
            label="Errored sessions"
            value={
              profile && profile.errorSessionCount > 0
                ? `${formatCount(profile.errorSessionCount)}${errorRate ? ` (${errorRate})` : ""}`
                : "0"
            }
            isLoading={isLoading}
            destructive={(profile?.errorSessionCount ?? 0) > 0}
          />
          <StatItem
            label="Total cost"
            value={
              profile && profile.costTotalMicrocents > 0 ? formatPrice(profile.costTotalMicrocents / 100_000_000) : "-"
            }
            isLoading={isLoading}
          />
          <StatItem
            label="Tokens"
            value={profile && profile.tokensTotal > 0 ? formatCount(profile.tokensTotal) : "-"}
            isLoading={isLoading}
          />
          <StatItem
            label="Avg trace duration"
            value={profile && profile.avgDurationNs > 0 ? formatDuration(profile.avgDurationNs) : "-"}
            isLoading={isLoading}
          />
          <StatItem label="Active days" value={formatCount(profile?.activeDays ?? 0)} isLoading={isLoading} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-lg bg-gradient-to-l from-secondary to-transparent" />
      </div>
    </div>
  )
}
