import { Badge, Icon, Text, Tooltip } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, SnowflakeIcon } from "lucide-react"
import type { AgentScoreSnapshot } from "./agent-score-mock.ts"
import { formatScore, formatSessions } from "./score-formatters.ts"
import { ScoreRing } from "./score-ring.tsx"
import { ScoreSparkline } from "./score-sparkline.tsx"

function DeltaLine({ snapshot }: { readonly snapshot: AgentScoreSnapshot }) {
  if (snapshot.score === null || snapshot.previousScore === null) return null
  const delta = Math.round((snapshot.score - snapshot.previousScore) * 10) / 10
  const icon = delta === 0 ? MinusIcon : delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon
  const color = delta === 0 ? "foregroundMuted" : delta > 0 ? "successMutedForeground" : "destructiveMutedForeground"

  return (
    <div className="flex flex-row items-center gap-1">
      <Icon icon={icon} size="sm" color={color} />
      <Text.H5 color={color} className="tabular-nums">
        {delta === 0 ? "No change" : `${Math.abs(delta).toFixed(1)} ${delta > 0 ? "up" : "down"}`}
      </Text.H5>
      <Text.H5 color="foregroundMuted">from {formatScore(snapshot.previousScore)} yesterday</Text.H5>
    </div>
  )
}

export function ScoreHeadlinePanel({ snapshot }: { readonly snapshot: AgentScoreSnapshot }) {
  const belowFloor = snapshot.score === null

  return (
    <div className="flex flex-row flex-wrap items-center gap-6 rounded-lg bg-secondary p-4">
      <ScoreRing score={snapshot.score} />
      <div className="flex min-w-64 flex-1 flex-col gap-2">
        <div className="flex flex-row flex-wrap items-center gap-2">
          <Text.H4M>Agent Score</Text.H4M>
          {snapshot.isProvisional ? (
            <Tooltip
              asChild
              trigger={
                <Badge variant="warningMuted" size="small" className="cursor-default">
                  Provisional
                </Badge>
              }
            >
              {`At this sample size the score can swing ${snapshot.intervalHalfWidth} points on its own, so day to day moves say little.`}
            </Tooltip>
          ) : null}
          {snapshot.safety.isBinding ? (
            <Tooltip
              asChild
              trigger={
                <Badge variant="destructiveMuted" size="small" className="cursor-default">
                  Capped at {snapshot.safety.cap}
                </Badge>
              }
            >
              {`Everything else scores ${formatScore(snapshot.uncappedScore)}. A confirmed leak holds the score down until you fix it.`}
            </Tooltip>
          ) : null}
        </div>
        {belowFloor ? (
          <Text.H5 color="foregroundMuted">
            {formatSessions(snapshot.eligibleSessions)} of {snapshot.minSessions} sessions. One session still moves the
            score by more than 5 points, so we show what we found instead of a number.
          </Text.H5>
        ) : (
          <DeltaLine snapshot={snapshot} />
        )}
        <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text.H6 color="foregroundMuted">
            Last {snapshot.windowDays} days · {formatSessions(snapshot.eligibleSessions)} sessions
          </Text.H6>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <div className="flex flex-row items-center gap-1">
            <Icon icon={SnowflakeIcon} size="xs" color="foregroundMuted" />
            <Tooltip
              asChild
              trigger={
                <span className="inline-flex cursor-default">
                  <Text.H6 color="foregroundMuted">Frozen {snapshot.frozenAt}</Text.H6>
                </span>
              }
            >
              A signal can be promoted today on evidence from a month ago. We write each day's score once and never
              touch it again, so last Tuesday still reads the way it did last Tuesday.
            </Tooltip>
          </div>
          <Text.H6 color="foregroundMuted">· scoring {snapshot.scoringVersion}</Text.H6>
        </div>
      </div>
      <ScoreSparkline history={snapshot.history} className="max-w-56" />
    </div>
  )
}
