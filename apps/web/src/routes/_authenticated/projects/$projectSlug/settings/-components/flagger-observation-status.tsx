import type { FlaggerCoverageRow } from "@domain/flaggers"
import { Button, Icon, Text, Tooltip } from "@repo/ui"
import { ActivityIcon, ChevronDownIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

const formatCount = (value: number) => new Intl.NumberFormat().format(value)
const formatShare = (value: number) => `${Math.round(value * 100)}%`

function CoverageMetric({
  label,
  value,
  context,
}: {
  readonly label: string
  readonly value: string
  readonly context?: string
}) {
  return (
    <div className="flex min-w-28 flex-col gap-0.5">
      <Text.H7 color="foregroundMuted">{label}</Text.H7>
      <Text.H6 className="tabular-nums">{value}</Text.H6>
      {context ? <Text.H7 color="foregroundMuted">{context}</Text.H7> : null}
    </div>
  )
}

const selectionSummary = (row: FlaggerCoverageRow): string => {
  const selections = [
    { label: "Deterministic", count: row.selectionPaths.deterministic },
    { label: "Hinted", count: row.selectionPaths.hinted },
    { label: "Uniform sample", count: row.selectionPaths.uniformSample },
    { label: "Random sample", count: row.selectionPaths.ordinarySample },
  ]
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${label} ${formatCount(count)}`)

  return selections.length > 0 ? selections.join(" · ") : "No selections recorded"
}

const limitationSummary = (row: FlaggerCoverageRow): string | null => {
  const limitations = [
    { label: "Skipped", count: row.selectionPaths.skipped },
    { label: "Rate-limited", count: row.selectionPaths.rateLimited },
    { label: "Missing decisions", count: row.missingTelemetry },
    { label: "Incomplete sampling data", count: row.unknownSelectionProbability },
  ]
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${label} ${formatCount(count)}`)

  return limitations.length > 0 ? limitations.join(" · ") : null
}

export function FlaggerObservationStatus({
  flaggerSlug,
  coverage,
}: {
  readonly flaggerSlug: string
  readonly coverage: FlaggerCoverageRow
}) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = `${flaggerSlug}-observation-details`
  const rateLimited = coverage.selectionPaths.rateLimited > 0
  const limitations = limitationSummary(coverage)
  const observationSummary =
    coverage.eligibleSessions === 0
      ? "Waiting for production sessions"
      : `Observed ${formatCount(coverage.examinedSessions)} of ${formatCount(coverage.eligibleSessions)} sessions · 28 days`

  return (
    <div className="flex flex-col gap-2">
      <Tooltip
        asChild
        side="top"
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="w-fit px-1.5"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((current) => !current)}
          >
            <Icon
              icon={rateLimited ? TriangleAlertIcon : ActivityIcon}
              size="xs"
              color={rateLimited ? "warningMutedForeground" : "foregroundMuted"}
            />
            <span className="tabular-nums">{observationSummary}</span>
            {rateLimited ? <span className="text-warning-muted-foreground">· Rate limited</span> : null}
            <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size="xs" color="foregroundMuted" />
          </Button>
        }
      >
        Shows how much eligible traffic this flagger inspected; open for details.
      </Tooltip>

      {expanded ? (
        <div id={detailsId} className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-row flex-wrap gap-x-8 gap-y-3">
            <CoverageMetric label="Eligible sessions" value={formatCount(coverage.eligibleSessions)} />
            <CoverageMetric label="Examined" value={formatCount(coverage.examinedSessions)} />
            <CoverageMetric
              label="Usable evidence"
              value={`${formatCount(coverage.readableSessions)} (${formatShare(coverage.readableShare)})`}
              context="Complete result and sampling data"
            />
            <CoverageMetric
              label="Findings"
              value={formatCount(coverage.positiveFindings)}
              {...(coverage.positiveFindings > 0
                ? {
                    context: `${formatCount(coverage.calibrationReadyFindings)} with complete sampling data`,
                  }
                : {})}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <Text.H7 color="foregroundMuted">Screening paths</Text.H7>
            <Text.H6 color="foregroundMuted" className="tabular-nums">
              {selectionSummary(coverage)}
            </Text.H6>
          </div>
          {limitations ? (
            <div className="flex flex-col gap-0.5">
              <Text.H7 color="foregroundMuted">Unavailable observations</Text.H7>
              <Text.H6 color={rateLimited ? "warningMutedForeground" : "foregroundMuted"} className="tabular-nums">
                {limitations}
              </Text.H6>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
