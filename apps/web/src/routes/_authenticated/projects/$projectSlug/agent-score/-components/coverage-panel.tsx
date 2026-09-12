import { Text } from "@repo/ui"
import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatPercent } from "./agent-score-format.ts"

/**
 * What the readers could and could not see.
 *
 * Coverage is the page's answer to "why is this number missing" and to "how much should I trust the
 * one that is here". It never turns an absence into a healthy reading: every figure here is a
 * denominator or an exclusion, and none of them is a score.
 */
export function CoveragePanel({ explanation }: { readonly explanation: AgentScoreExplanationRecord | undefined }) {
  if (!explanation || explanation.status !== "ready" || !explanation.explanation) return null
  const evidence = explanation.explanation

  const readers = [...evidence.coverage.readers]
    .filter((reader) => reader.applicableSessions > 0)
    .sort((left, right) => left.coverage - right.coverage)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap gap-x-8 gap-y-3">
        <Figure label="Sessions read" value={formatCount(evidence.readSessionCount)} />
        <Figure label="Outcome examined" value={formatCount(evidence.coverage.outcomeExaminedSessions)} />
        <Figure label="Safety examined" value={formatCount(evidence.coverage.safetyExaminedSessions)} />
        <Figure label="Reliability readable" value={formatCount(evidence.coverage.reliabilityReadableSessions)} />
        <Figure label="Critical paths complete" value={formatCount(evidence.coverage.speed.completeSessionCount)} />
        {evidence.coverage.unmeasuredSignalEffects > 0 ? (
          <Figure
            label="Signals without a measured effect"
            value={formatCount(evidence.coverage.unmeasuredSignalEffects)}
          />
        ) : null}
      </div>

      {readers.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2">
            <Text.H6 color="foregroundMuted">Reader</Text.H6>
            <Text.H6 color="foregroundMuted">Examined</Text.H6>
            <Text.H6 color="foregroundMuted">Missing evidence</Text.H6>
          </div>
          {readers.map((reader) => {
            const limitations = Object.entries(reader.limitations)
            return (
              <div key={reader.readerId} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Text.H6B className="truncate">{reader.label}</Text.H6B>
                  <Text.H6 color="foregroundMuted">{reader.scoreDimensions.join(", ")}</Text.H6>
                </div>
                <Text.H6 color="foregroundMuted" className="tabular-nums">
                  {formatPercent(reader.coverage, 0)}
                </Text.H6>
                <Text.H6 color="foregroundMuted">
                  {limitations.length === 0
                    ? "-"
                    : limitations.map(([reason, count]) => `${reason} (${count})`).join(", ")}
                </Text.H6>
              </div>
            )
          })}
        </div>
      ) : null}

      <Text.H6 color="foregroundMuted">
        Cost artifact {evidence.coverage.artifactVersions.cost} · catalog{" "}
        {evidence.coverage.artifactVersions.costCatalog} · latency reference{" "}
        {evidence.coverage.artifactVersions.latency}
      </Text.H6>
    </div>
  )
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6B className="tabular-nums">{value}</Text.H6B>
    </div>
  )
}
