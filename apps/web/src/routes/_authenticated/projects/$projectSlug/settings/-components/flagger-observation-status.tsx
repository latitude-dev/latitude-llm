import type { FlaggerCoverageRow } from "@domain/flaggers"
import { Button, Icon, Text, Tooltip } from "@repo/ui"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SUB_DAY_WINDOW_MS = 36 * HOUR_MS

const formatCount = (value: number) => new Intl.NumberFormat().format(value)
const formatShare = (value: number) => `${Math.round(value * 100)}%`
const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })

export interface FlaggerCoverageWindow {
  readonly fromIso: string
  readonly toIso: string
  readonly recordingSinceIso: string | null
  readonly sessionsBeforeRecording: number
}

// The measured window, not the requested one: coverage starts where the project's
// screening records start, so a young flagger reads "3 days" rather than "28 days".
const formatWindow = ({ fromIso, toIso }: FlaggerCoverageWindow): string => {
  const span = Math.max(0, Date.parse(toIso) - Date.parse(fromIso))
  if (span < SUB_DAY_WINDOW_MS) {
    const hours = Math.max(1, Math.round(span / HOUR_MS))
    return `${hours} ${hours === 1 ? "hour" : "hours"}`
  }
  const days = Math.round(span / DAY_MS)
  return `${days} ${days === 1 ? "day" : "days"}`
}

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
    { label: "Not yet screened", count: row.unscreenedSessions },
    { label: "Incomplete sampling data", count: row.unknownSelectionProbability },
  ]
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${label} ${formatCount(count)}`)

  return limitations.length > 0 ? limitations.join(" · ") : null
}

const recordingNote = (coverageWindow: FlaggerCoverageWindow): string | null => {
  if (coverageWindow.sessionsBeforeRecording === 0 || coverageWindow.recordingSinceIso === null) return null
  return `Screening records start ${formatDay(coverageWindow.recordingSinceIso)}; ${formatCount(coverageWindow.sessionsBeforeRecording)} older sessions in the requested window are not counted`
}

export function FlaggerObservationStatus({
  flaggerSlug,
  coverage,
  coverageWindow,
}: {
  readonly flaggerSlug: string
  readonly coverage: FlaggerCoverageRow
  readonly coverageWindow: FlaggerCoverageWindow
}) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = `${flaggerSlug}-observation-details`
  const rateLimited = coverage.selectionPaths.rateLimited > 0
  const limitations = limitationSummary(coverage)
  const note = recordingNote(coverageWindow)
  const observationSummary =
    coverage.eligibleSessions === 0
      ? "Waiting for production sessions"
      : `Observed ${formatCount(coverage.examinedSessions)} of ${formatCount(coverage.eligibleSessions)} sessions · ${formatWindow(coverageWindow)}`

  return (
    <div className="flex flex-col gap-2">
      <Tooltip
        asChild
        side="top"
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="w-fit px-1.5 font-normal"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((current) => !current)}
          >
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
          {note ? (
            <Text.H7 color="foregroundMuted" className="tabular-nums">
              {note}
            </Text.H7>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
