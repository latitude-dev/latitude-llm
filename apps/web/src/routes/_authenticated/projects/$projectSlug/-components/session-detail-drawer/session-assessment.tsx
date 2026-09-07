import type {
  SessionAssessment,
  SessionAssessmentItem,
  SessionDimensionEffect,
  SessionDimensionSummary,
  SessionEvidenceDestination,
} from "@domain/agent-score"
import { Badge, cn, Skeleton, Text } from "@repo/ui"
import { formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import { useSessionAssessment } from "../../../../../../domains/session-assessments/session-assessments.collection.ts"

const DIMENSION_LABELS = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
} as const

const humanize = (value: string) =>
  value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase())

const formatMicrocents = (value: number) => formatPrice(value / 100_000_000)

const dimensionValue = (summary: SessionDimensionSummary): string => {
  switch (summary.scoreDimension) {
    case "outcome":
      if (summary.taskOutcome?.verdict) return summary.taskOutcome.verdict === "success" ? "Succeeded" : "Failed"
      if (summary.taskOutcome?.probability !== undefined) return formatPercentage(summary.taskOutcome.probability)
      return "No verdict"
    case "reliability":
      if (summary.completion === "usable") return "Usable completion"
      if (summary.completion === "terminalFailure") return "Terminal failure"
      return "Undetermined"
    case "cost":
      return summary.observedMicrocents === undefined ? "Not measured" : formatMicrocents(summary.observedMicrocents)
    case "speed":
      return summary.observedCriticalPathNs === undefined
        ? "Not measured"
        : formatDuration(summary.observedCriticalPathNs)
    case "safety":
      return summary.confirmedHarmCount > 0
        ? `${summary.confirmedHarmCount} confirmed harm`
        : summary.exposureCount > 0
          ? `${summary.exposureCount} exposure${summary.exposureCount === 1 ? "" : "s"}`
          : "No harm found"
  }
}

const dimensionDetail = (summary: SessionDimensionSummary): string => {
  const counts = summary.evidenceCounts
  const evidence = `${counts.positive} positive · ${counts.negative} negative · ${counts.context} context`
  switch (summary.scoreDimension) {
    case "reliability":
      return `${summary.recoveredIncidentCount} recovered · ${summary.unrecoveredIncidentCount} unrecovered`
    case "cost": {
      const avoidable = (summary.measuredAvoidableMicrocents ?? 0) + (summary.estimatedAvoidableMicrocents ?? 0)
      return avoidable > 0 ? `${formatMicrocents(avoidable)} avoidable · ${evidence}` : evidence
    }
    case "speed": {
      const avoidable = (summary.measuredAvoidableNs ?? 0) + (summary.estimatedAvoidableNs ?? 0)
      return avoidable > 0 ? `${formatDuration(avoidable)} avoidable · ${evidence}` : evidence
    }
    case "safety":
      return `${summary.successfulDefenseCount} defended · ${evidence}`
    default:
      return evidence
  }
}

function DimensionCard({ summary }: { readonly summary: SessionDimensionSummary }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">{DIMENSION_LABELS[summary.scoreDimension]}</Text.H6>
        <span className="text-[0.6875rem] text-muted-foreground">{humanize(summary.coverage)}</span>
      </div>
      <Text.H5M ellipsis noWrap color={summary.evidenceCounts.negative > 0 ? "destructive" : "foreground"}>
        {dimensionValue(summary)}
      </Text.H5M>
      <span className="truncate text-[0.6875rem] text-muted-foreground">{dimensionDetail(summary)}</span>
    </div>
  )
}

const directionFor = (item: SessionAssessmentItem): SessionDimensionEffect["direction"] => {
  if (item.effects.some((effect) => effect.direction === "negative")) return "negative"
  if (item.effects.some((effect) => effect.direction === "positive")) return "positive"
  return "context"
}

const directionVariant = {
  positive: "successMuted",
  negative: "destructiveMuted",
  context: "muted",
} as const

const formatImpact = (effect: SessionDimensionEffect): string | undefined => {
  const impact = effect.impact
  if (!impact) return undefined
  switch (impact.kind) {
    case "taskOutcome":
      return impact.probability === undefined
        ? humanize(impact.verdict)
        : `${humanize(impact.verdict)} · ${formatPercentage(impact.probability)}`
    case "completion":
      return humanize(impact.status)
    case "incident":
      return impact.sameSubjectRecovered ? `${humanize(impact.status)} by same operation` : humanize(impact.status)
    case "spend":
      return impact.avoidableMicrocents === undefined
        ? formatMicrocents(impact.observedMicrocents)
        : `${formatMicrocents(impact.avoidableMicrocents)} avoidable`
    case "duration":
      return impact.avoidableNs === undefined
        ? formatDuration(impact.observedNs)
        : `${formatDuration(impact.avoidableNs)} avoidable`
    case "outcomeAssociation":
      return impact.probabilityChange === undefined
        ? undefined
        : `${impact.probabilityChange > 0 ? "+" : ""}${formatPercentage(impact.probabilityChange)}`
    case "safety":
      return `${humanize(impact.status)} · ${humanize(impact.findingKind)}`
    case "observation":
      return impact.value === undefined ? undefined : `${impact.value}${impact.unit ? ` ${impact.unit}` : ""}`
  }
}

function EvidenceEffect({ effect }: { readonly effect: SessionDimensionEffect }) {
  const impact = formatImpact(effect)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={directionVariant[effect.direction]} size="small">
        {DIMENSION_LABELS[effect.scoreDimension]} · {humanize(effect.direction)}
      </Badge>
      <Badge variant="outlineMuted" size="small">
        {humanize(effect.measurement)}
      </Badge>
      {impact ? <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{impact}</span> : null}
    </div>
  )
}

export type SessionAssessmentDestinationHandler = (
  destination: SessionEvidenceDestination,
  item: SessionAssessmentItem,
) => void

const shortId = (value: string) => value.slice(0, 7)

function destinationLabel(destination: SessionEvidenceDestination, item: SessionAssessmentItem): string {
  switch (destination.kind) {
    case "sessionMessage":
      return `Message ${destination.messageIndex + 1}`
    case "span":
      return `Span ${shortId(destination.spanId)}`
    case "toolCall": {
      const anchor = item.anchors.find(
        (candidate) => candidate.kind === "toolCall" && candidate.toolCallId === destination.toolCallId,
      )
      return anchor?.kind === "toolCall" && anchor.toolName
        ? anchor.toolName
        : `Tool call ${shortId(destination.toolCallId)}`
    }
    case "score":
      return `Score ${shortId(destination.scoreId)}`
    case "signal":
      return `Signal ${shortId(destination.signalId)}`
    case "memoryEvent":
      return `Memory event ${shortId(destination.memoryEventId)}`
  }
}

function EvidenceItem({
  item,
  onOpenDestination,
}: {
  readonly item: SessionAssessmentItem
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const direction = directionFor(item)
  const navigableDestinations = item.destinations.filter((destination) => destination.kind !== "memoryEvent")
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border border-l-2 p-3",
        direction === "negative" && "border-l-destructive",
        direction === "positive" && "border-l-success-muted-foreground",
        direction === "context" && "border-l-muted-foreground/40",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5M>{item.label}</Text.H5M>
          {item.description ? <Text.H6 color="foregroundMuted">{item.description}</Text.H6> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {item.occurrenceCount > 1 ? (
            <Badge variant="outlineMuted" size="small">
              {item.occurrenceCount}×
            </Badge>
          ) : null}
          <Badge variant="muted" size="small">
            {humanize(item.source)}
          </Badge>
        </div>
      </div>
      {item.effects.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {item.effects.map((effect) => (
            <EvidenceEffect key={`${effect.scoreDimension}:${effect.role}`} effect={effect} />
          ))}
        </div>
      ) : (
        <Text.H6 color="foregroundMuted">No benchmark dimension assigned.</Text.H6>
      )}
      {onOpenDestination && navigableDestinations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {navigableDestinations.map((destination) => (
            <button
              key={JSON.stringify(destination)}
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenDestination(destination, item)}
            >
              {destinationLabel(destination, item)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ReaderCoverage({ assessment }: { readonly assessment: SessionAssessment }) {
  const readers = assessment.coverage.readers
  const examined = readers.filter((reader) => reader.status === "examined").length
  const partial = readers.filter((reader) => reader.status === "partiallyExamined").length
  const missed = readers.filter((reader) => reader.status === "notExamined").length

  return (
    <details className="group rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Reader coverage: {examined} examined{partial > 0 ? `, ${partial} partial` : ""}
        {missed > 0 ? `, ${missed} not examined` : ""}
      </summary>
      <div className="flex flex-col gap-2 pt-3">
        {readers.map((reader) => (
          <div key={reader.readerId} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-foreground">{reader.label}</span>
            <span className="shrink-0 text-muted-foreground">{humanize(reader.status)}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

export function SessionAssessmentContent({
  assessment,
  onOpenDestination,
}: {
  readonly assessment: SessionAssessment
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const evidenceItems = assessment.items.filter((item) => item.effects.length > 0)
  const rawItems = assessment.items.filter((item) => item.effects.length === 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {assessment.dimensions.map((summary) => (
          <DimensionCard key={summary.scoreDimension} summary={summary} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Text.H5M>Evidence</Text.H5M>
        {evidenceItems.length > 0 ? (
          evidenceItems.map((item) => <EvidenceItem key={item.id} item={item} onOpenDestination={onOpenDestination} />)
        ) : (
          <Text.H6 color="foregroundMuted">No benchmark evidence was found for this session.</Text.H6>
        )}
      </div>

      {rawItems.length > 0 ? (
        <details className="group rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Raw evidence ({rawItems.length})</summary>
          <div className="flex flex-col gap-2 pt-3">
            {rawItems.map((item) => (
              <EvidenceItem key={item.id} item={item} onOpenDestination={onOpenDestination} />
            ))}
          </div>
        </details>
      ) : null}

      <ReaderCoverage assessment={assessment} />
    </div>
  )
}

export function SessionAssessmentSection({
  projectId,
  sessionId,
  onOpenDestination,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const assessment = useSessionAssessment({ projectId, sessionId })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text.H4M>Session assessment</Text.H4M>
        <Text.H6 color="foregroundMuted">
          What helped or hurt this session across the five Agent Score dimensions.
        </Text.H6>
      </div>
      {assessment.isLoading ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : assessment.isError ? (
        <Text.H6 color="foregroundMuted">Could not load the session assessment.</Text.H6>
      ) : assessment.data ? (
        <SessionAssessmentContent assessment={assessment.data} onOpenDestination={onOpenDestination} />
      ) : null}
    </div>
  )
}
