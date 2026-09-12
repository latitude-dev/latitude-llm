import { Text, Tooltip } from "@repo/ui"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatInterval, formatScore } from "./agent-score-format.ts"

/**
 * The headline: the score, how uncertain it is, and what it covers.
 *
 * The window and the session count sit beside the number rather than under a "details" affordance
 * because they change what it means — the same agent scores differently over 7 days and 28, and a
 * reader who cannot see which one they are looking at cannot compare two of them.
 */
export function AgentScoreHeadline({ snapshot }: { readonly snapshot: AgentScoreRecord }) {
  return (
    <div className="flex flex-row flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex flex-row items-end gap-2">
        <Text.H3M className="tabular-nums leading-none">{formatScore(snapshot.score)}</Text.H3M>
        <Text.H6 color="foregroundMuted" className="pb-0.5">
          / 100
        </Text.H6>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <Metadatum label="95% interval" value={formatInterval(snapshot.interval)} />
        <Metadatum label="Window" value={`${snapshot.windowDays} days`} />
        <Metadatum label="Sessions" value={formatCount(snapshot.eligibleSessionCount)} />
        <Metadatum
          label="Scoring version"
          value={snapshot.scoringVersion}
          tooltip="Scores produced by different versions are not directly comparable."
        />
        {snapshot.policyCap === null ? null : (
          <Metadatum
            label="Policy cap"
            value={formatScore(snapshot.policyCap)}
            tooltip="A safety policy rule capped this score. The points it removed belong to the rule, not to any cause below."
          />
        )}
      </div>
    </div>
  )
}

function Metadatum({
  label,
  value,
  tooltip,
}: {
  readonly label: string
  readonly value: string
  readonly tooltip?: string
}) {
  const content = (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6B className="tabular-nums">{value}</Text.H6B>
    </div>
  )
  if (!tooltip) return content
  return (
    <Tooltip asChild trigger={<span className="cursor-default">{content}</span>}>
      {tooltip}
    </Tooltip>
  )
}
