import type {
  SessionAssessment,
  SessionAssessmentImpactLevel,
  SessionAssessmentItem,
  SessionAssessmentPolarity,
  SessionCostMetricEvidence,
  SessionDimensionSummary,
  SessionEvidenceDestination,
} from "@domain/agent-score"
import { Button, cn, Icon, Skeleton, Text } from "@repo/ui"
import { formatDuration, formatPrice } from "@repo/utils"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  MessageSquareTextIcon,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import {
  formatLifecycleLabel,
  getPrimaryLifecycleState,
} from "../../../../../../components/signals/lifecycle-formatters.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import type { ScoreRecord } from "../../../../../../domains/scores/scores.functions.ts"
import type { SessionSignalRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSignal } from "../../../../../../domains/signals/signals.collection.ts"
import { AnnotationCard } from "../annotations/annotation-card.tsx"
import type { AnnotationSaveData } from "../annotations/annotation-list.tsx"
import { isGlobalAnnotation } from "../annotations/hooks/use-annotation-navigation.ts"
import { ReadOnlyScoreCard } from "../scores/score-card.tsx"

interface FindingGroup {
  readonly key: string
  readonly label: string
  readonly polarity: SessionAssessmentPolarity
  readonly impactLevel: SessionAssessmentImpactLevel
  readonly items: readonly SessionAssessmentItem[]
  readonly signalId?: string
  readonly scoreIds: readonly string[]
  readonly occurrenceCount: number
}

interface FindingMetric {
  readonly key: string
  readonly label: string
  readonly value: string
}

export type SessionAssessmentDestinationHandler = (
  destination: SessionEvidenceDestination,
  item: SessionAssessmentItem,
) => void

const POLARITY_PRIORITY = {
  positive: 0,
  unknown: 1,
  negative: 2,
} as const satisfies Record<SessionAssessmentPolarity, number>

const IMPACT_PRIORITY = {
  low: 0,
  medium: 1,
  high: 2,
} as const satisfies Record<SessionAssessmentImpactLevel, number>

const MAX_VISIBLE_OCCURRENCES = 3

const DESTINATION_PRIORITY = {
  sessionMessage: 0,
  toolCall: 1,
  span: 2,
  score: 3,
  signal: 4,
  memoryEvent: 5,
} as const satisfies Record<SessionEvidenceDestination["kind"], number>

const formatMicrocents = (value: number) => formatPrice(value / 100_000_000)

const scoreIsAnnotation = (score: ScoreRecord): boolean => score.source === "annotation"

const asAnnotationRecord = (score: ScoreRecord): AnnotationRecord => score as unknown as AnnotationRecord

const scoreLabel = (score: ScoreRecord): string => {
  switch (score.source) {
    case "annotation":
      return "Annotation"
    case "evaluation":
      return "Evaluation"
    case "custom":
      return "Custom score"
  }
}

const maxImpact = (
  left: SessionAssessmentImpactLevel,
  right: SessionAssessmentImpactLevel,
): SessionAssessmentImpactLevel => (IMPACT_PRIORITY[right] > IMPACT_PRIORITY[left] ? right : left)

const strongestPolarity = (
  left: SessionAssessmentPolarity,
  right: SessionAssessmentPolarity,
): SessionAssessmentPolarity => (POLARITY_PRIORITY[right] > POLARITY_PRIORITY[left] ? right : left)

const groupAssessmentItems = (
  items: readonly SessionAssessmentItem[],
  scores: readonly ScoreRecord[],
): readonly FindingGroup[] => {
  const scoresById = new Map(scores.map((score) => [score.id, score]))
  const grouped = new Map<
    string,
    {
      label: string
      polarity: SessionAssessmentPolarity
      impactLevel: SessionAssessmentImpactLevel
      items: SessionAssessmentItem[]
      signalId?: string
      scoreIds: Set<string>
      occurrenceCount: number
    }
  >()

  for (const item of items) {
    const linkedScore = item.scoreIds.flatMap((scoreId) => {
      const score = scoresById.get(scoreId)
      return score ? [score] : []
    })[0]
    const signalId = item.signalIds[0]
    const label = item.label === "Score" && linkedScore ? scoreLabel(linkedScore) : item.label
    const previous = grouped.get(item.groupKey)

    if (!previous) {
      grouped.set(item.groupKey, {
        label,
        polarity: item.polarity,
        impactLevel: item.impactLevel,
        items: [item],
        ...(signalId ? { signalId } : {}),
        scoreIds: new Set(item.scoreIds),
        occurrenceCount: item.occurrenceCount,
      })
      continue
    }

    previous.items.push(item)
    previous.polarity = strongestPolarity(previous.polarity, item.polarity)
    previous.impactLevel = maxImpact(previous.impactLevel, item.impactLevel)
    previous.occurrenceCount = signalId
      ? Math.max(previous.occurrenceCount, item.occurrenceCount)
      : previous.occurrenceCount + item.occurrenceCount
    if (signalId) {
      previous.signalId = signalId
      previous.label = label
    }
    for (const scoreId of item.scoreIds) previous.scoreIds.add(scoreId)
  }

  return [...grouped.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      polarity: group.polarity,
      impactLevel: group.impactLevel,
      items: group.items,
      ...(group.signalId ? { signalId: group.signalId } : {}),
      scoreIds: [...group.scoreIds],
      occurrenceCount: group.occurrenceCount,
    }))
    .sort(
      (left, right) =>
        IMPACT_PRIORITY[right.impactLevel] - IMPACT_PRIORITY[left.impactLevel] ||
        right.occurrenceCount - left.occurrenceCount ||
        left.label.localeCompare(right.label),
    )
}

const COST_METRIC_LABELS: Readonly<Record<string, string>> = {
  "cost.recoverable_spend_share": "Recoverable spend",
  "cost.cache_gap": "Missed cache opportunity",
  "context.redundant_input_share": "Redundant model input",
  "context.avoidable_pressure": "Avoidable context pressure",
  "tools.dead_surface": "Unused tool definitions",
  "tools.repeated_call": "Repeated tool calls",
  "tools.thrashing": "Tool-call loops",
  "tools.structural_defect": "Recovered tool-call defects",
  "memory.repeated_zero_hit": "Repeated empty memory searches",
  "memory.noop_rewrite": "No-op memory writes",
  "memory.reverted_write": "Reverted memory writes",
  "recovery.recovered_incident_rate": "Recovered incidents",
}

const COVERAGE_LIMITATION_LABELS: Readonly<Record<string, string>> = {
  missingPricing: "some spend could not be priced",
  missingContent: "some model input was not captured",
  truncatedContent: "some model input was too large to read",
  unknownModelContext: "some model context limits are unknown",
  criticalPathUnavailable: "the critical path could not be reconstructed",
  missingTelemetry: "some telemetry is missing",
  unmappedTelemetry: "some telemetry values are unrecognized",
}

const formatCompactCount = (value: number): string =>
  value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(Math.round(value))

const COST_UNIT_LABELS = {
  inputTokens: "tokens",
  cacheTokens: "tokens",
  contextLimitTokens: "tokens",
  toolCalls: "tool calls",
  memoryOperations: "memory operations",
  memoryReads: "memory reads",
  memoryWrites: "memory writes",
  completedSessions: "completed sessions",
} as const

const costMetricValue = (metric: SessionCostMetricEvidence): string => {
  if (metric.aggregation === "sessionMean" && metric.rawValue !== undefined) {
    return `${(metric.rawValue * 100).toFixed(1)}% average`
  }
  if (metric.adverseUnits === undefined || metric.eligibleUnits === undefined) return ""
  if (metric.rawUnit === "microcents") {
    return `${formatMicrocents(metric.adverseUnits)} of ${formatMicrocents(metric.eligibleUnits)}`
  }
  const suffix = COST_UNIT_LABELS[metric.rawUnit]
  return `${formatCompactCount(metric.adverseUnits)} of ${formatCompactCount(metric.eligibleUnits)} ${suffix}`
}

const costMetricPolarity = (metric: SessionCostMetricEvidence): "negative" | "positive" | undefined => {
  if (
    metric.measurementState !== "measured" ||
    metric.eligibleUnits === undefined ||
    metric.eligibleUnits <= 0 ||
    metric.adverseUnits === undefined
  ) {
    return undefined
  }
  if (metric.adverseUnits > 0) return "negative"
  if (metric.limitations.length > 0 || (metric.nativeImpact?.upper ?? 0) > 0) return undefined
  return "positive"
}

const costMetrics = (
  cost: Extract<SessionDimensionSummary, { scoreDimension: "cost" }> | undefined,
  polarity: "negative" | "positive",
): FindingMetric[] =>
  (cost?.families ?? [])
    .flatMap((family) => family.metrics)
    .filter((metric) => costMetricPolarity(metric) === polarity)
    .map((metric) => ({
      key: `cost-metric-${metric.metricId}`,
      label: COST_METRIC_LABELS[metric.metricId] ?? metric.metricId,
      value: costMetricValue(metric),
    }))

/**
 * An avoidable amount against what it was avoidable out of.
 *
 * A bare "$0.16 avoidable" is unreadable without the spend it came out of, and the same four
 * seconds mean different things on a five-second and a five-minute critical path. The denominator
 * is dropped rather than guessed when the session could not report one.
 */
const withDenominator = (avoidable: string, observed: string | undefined): string =>
  observed === undefined ? avoidable : `${avoidable} of ${observed}`

const avoidableDenominators = (
  cost: Extract<SessionDimensionSummary, { scoreDimension: "cost" }> | undefined,
  speed: Extract<SessionDimensionSummary, { scoreDimension: "speed" }> | undefined,
) => ({
  pricedSpend: cost?.observedMicrocents ? formatMicrocents(cost.observedMicrocents) : undefined,
  criticalPath: speed?.observedCriticalPathNs ? formatDuration(speed.observedCriticalPathNs) : undefined,
})

const dimension = <Dimension extends SessionDimensionSummary["scoreDimension"]>(
  assessment: SessionAssessment,
  scoreDimension: Dimension,
): Extract<SessionDimensionSummary, { scoreDimension: Dimension }> | undefined =>
  assessment.dimensions.find(
    (summary): summary is Extract<SessionDimensionSummary, { scoreDimension: Dimension }> =>
      summary.scoreDimension === scoreDimension,
  )

const metricsByPolarity = (
  assessment: SessionAssessment,
): Readonly<Record<SessionAssessmentPolarity, readonly FindingMetric[]>> => {
  const outcome = dimension(assessment, "outcome")
  const reliability = dimension(assessment, "reliability")
  const cost = dimension(assessment, "cost")
  const speed = dimension(assessment, "speed")
  const safety = dimension(assessment, "safety")
  const negative: FindingMetric[] = []
  const positive: FindingMetric[] = []

  if (outcome?.taskOutcome?.verdict === "failure") {
    negative.push({ key: "task-outcome", label: "Task outcome", value: "Failed" })
  }
  if (reliability?.completion === "terminalFailure") {
    negative.push({ key: "completion", label: "Completion", value: "Failed" })
  }
  if (safety && safety.confirmedHarmCount > 0) {
    negative.push({
      key: "confirmed-harm",
      label: "Confirmed harm",
      value: String(safety.confirmedHarmCount),
    })
  }
  if (reliability && reliability.unrecoveredIncidentCount > 0) {
    negative.push({
      key: "unrecovered-incidents",
      label: "Unrecovered incidents",
      value: String(reliability.unrecoveredIncidentCount),
    })
  }
  negative.push(...costMetrics(cost, "negative"))
  const { pricedSpend, criticalPath } = avoidableDenominators(cost, speed)
  if (cost?.measuredAvoidableMicrocents) {
    negative.push({
      key: "avoidable-cost",
      label: "Avoidable cost",
      value: withDenominator(formatMicrocents(cost.measuredAvoidableMicrocents), pricedSpend),
    })
  } else if (cost?.estimatedAvoidableMicrocents) {
    negative.push({
      key: "estimated-avoidable-cost",
      label: "Estimated avoidable cost",
      value: withDenominator(formatMicrocents(cost.estimatedAvoidableMicrocents), pricedSpend),
    })
  }
  if (speed?.measuredAvoidableNs) {
    negative.push({
      key: "avoidable-time",
      label: "Avoidable time",
      value: withDenominator(formatDuration(speed.measuredAvoidableNs), criticalPath),
    })
  } else if (speed?.estimatedAvoidableNs) {
    negative.push({
      key: "estimated-avoidable-time",
      label: "Estimated avoidable time",
      value: withDenominator(formatDuration(speed.estimatedAvoidableNs), criticalPath),
    })
  }

  if (outcome?.taskOutcome?.verdict === "success") {
    positive.push({ key: "task-outcome", label: "Task outcome", value: "Succeeded" })
  }
  if (reliability?.completion === "usable") {
    positive.push({ key: "completion", label: "Completion", value: "Usable" })
  }
  if (safety && safety.successfulDefenseCount > 0) {
    positive.push({
      key: "successful-defenses",
      label: "Successful defenses",
      value: String(safety.successfulDefenseCount),
    })
  }
  positive.push(...costMetrics(cost, "positive"))

  return {
    negative: negative.slice(0, 3),
    unknown: [],
    positive: positive.slice(0, 3),
  }
}

const isSummaryOnlyGroup = (group: FindingGroup): boolean =>
  group.signalId === undefined &&
  group.items.every(
    (item) => item.metricId === "sessions.task_success" || item.metricId === "sessions.usable_completion",
  )

const primaryDestination = (item: SessionAssessmentItem): SessionEvidenceDestination | undefined =>
  [...item.destinations]
    .filter((destination) => destination.kind !== "memoryEvent" && destination.kind !== "signal")
    .sort((left, right) => DESTINATION_PRIORITY[left.kind] - DESTINATION_PRIORITY[right.kind])[0]

const destinationAction = (destination: SessionEvidenceDestination): string => {
  switch (destination.kind) {
    case "sessionMessage":
      return "View in conversation"
    case "toolCall":
      return "View tool call"
    case "span":
      return "View span"
    case "score":
      return "View evaluation"
    case "signal":
      return "View signal"
    case "memoryEvent":
      return "View memory event"
  }
}

const itemDescription = (item: SessionAssessmentItem): string | undefined => {
  const description = item.description?.trim()
  if (!description || description === item.label.trim()) return undefined
  const repeatedLabel = `${item.label.trim()}:`
  return description.startsWith(repeatedLabel) ? description.slice(repeatedLabel.length).trim() : description
}

const polarityTextClass = (polarity: SessionAssessmentPolarity): string =>
  cn({
    "text-destructive-muted-foreground": polarity === "negative",
    "text-muted-foreground": polarity === "unknown",
    "text-success-muted-foreground": polarity === "positive",
  })

const polarityIcon = (polarity: SessionAssessmentPolarity) =>
  polarity === "negative" ? CircleAlertIcon : polarity === "positive" ? CircleCheckIcon : CircleHelpIcon

const polarityIconColor = (polarity: SessionAssessmentPolarity) =>
  polarity === "negative"
    ? ("destructiveMutedForeground" as const)
    : polarity === "positive"
      ? ("successMutedForeground" as const)
      : ("foregroundMuted" as const)

const signalStateTextClass = (state: string | undefined, polarity: SessionAssessmentPolarity): string => {
  if (!state) return polarityTextClass(polarity)

  return cn({
    "text-primary": state === "new",
    "text-warning-muted-foreground": state === "escalating",
    "text-destructive-muted-foreground": state === "ongoing" || state === "regressed",
    "text-success-muted-foreground": state === "resolved",
    "text-muted-foreground":
      state === "ignored" || !["new", "escalating", "ongoing", "regressed", "resolved"].includes(state),
  })
}

function FindingRow({
  label,
  leading,
  trailing,
  expanded = false,
  onToggle,
}: {
  readonly label: string
  readonly leading: ReactNode
  readonly trailing?: ReactNode
  readonly expanded?: boolean
  readonly onToggle?: (() => void) | undefined
}) {
  const expandable = onToggle !== undefined

  return (
    <div
      className={cn("flex min-w-0 items-center transition-colors", {
        "hover:bg-secondary/80": expandable,
        "bg-secondary": expanded,
      })}
    >
      <div className="flex w-10 shrink-0 items-center justify-center">{leading}</div>
      {expandable ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-auto min-w-0 flex-1 rounded-none bg-transparent px-0 py-3 pr-4 font-normal text-muted-foreground hover:bg-transparent"
        >
          <button type="button" aria-label={label} aria-expanded={expanded} onClick={onToggle}>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {trailing}
            <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size="xs" color="foregroundMuted" />
          </button>
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4">
          <Text.H6 color="foregroundMuted" className="min-w-0 flex-1" ellipsis>
            {label}
          </Text.H6>
          {trailing}
        </div>
      )}
    </div>
  )
}

function FindingMetricRow({
  metric,
  polarity,
}: {
  readonly metric: FindingMetric
  readonly polarity: SessionAssessmentPolarity
}) {
  return (
    <FindingRow
      label={metric.label}
      leading={<Icon icon={polarityIcon(polarity)} size="xs" color={polarityIconColor(polarity)} />}
      trailing={
        <Text.H6 className={cn("shrink-0", polarityTextClass(polarity))} noWrap>
          {metric.value}
        </Text.H6>
      }
    />
  )
}

function FindingOccurrence({
  item,
  onOpenDestination,
}: {
  readonly item: SessionAssessmentItem
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const description = itemDescription(item)
  const destination = primaryDestination(item)
  const summary =
    description ?? (item.occurrenceCount > 1 ? `${item.occurrenceCount} cases detected` : "Detected in this session")

  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1" title={summary}>
        <Text.H6 color="foregroundMuted" lineClamp={1}>
          {summary}
        </Text.H6>
      </div>
      {destination && onOpenDestination ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto shrink-0 px-0 py-0"
          aria-label={destinationAction(destination)}
          onClick={() => onOpenDestination(destination, item)}
        >
          View
        </Button>
      ) : null}
    </div>
  )
}

function FindingOccurrences({
  items,
  onOpenDestination,
}: {
  readonly items: readonly SessionAssessmentItem[]
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE_OCCURRENCES)
  const hiddenCount = items.length - visibleItems.length

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-border">
        {visibleItems.map((item) => (
          <FindingOccurrence key={item.id} item={item} onOpenDestination={onOpenDestination} />
        ))}
      </div>
      {items.length > MAX_VISIBLE_OCCURRENCES ? (
        <div className="border-t border-border px-4 py-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 py-0"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer" : `Show ${hiddenCount} more`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function LinkedJudgments({
  group,
  scoresById,
  projectId,
  isUpdateLoading,
  onUpdate,
}: {
  readonly group: FindingGroup
  readonly scoresById: ReadonlyMap<string, ScoreRecord>
  readonly projectId: string
  readonly isUpdateLoading: boolean
  readonly onUpdate?: ((annotation: AnnotationRecord, data: AnnotationSaveData) => void) | undefined
}) {
  const scores = group.scoreIds.flatMap((scoreId) => {
    const score = scoresById.get(scoreId)
    return score ? [score] : []
  })

  if (scores.length === 0) {
    return (
      <div className="px-4 py-3">
        <Text.H6 color="foregroundMuted">No linked feedback is available.</Text.H6>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {scores.map((score) => {
        const annotation = scoreIsAnnotation(score) ? asAnnotationRecord(score) : null
        return annotation ? (
          <AnnotationCard
            key={score.id}
            annotation={annotation}
            projectId={projectId}
            isGlobal={isGlobalAnnotation(annotation)}
            showLinkedSignal={false}
            compact
            feedbackPrefix={group.label}
            isUpdateLoading={isUpdateLoading}
            onUpdate={(data) => onUpdate?.(annotation, data)}
          />
        ) : (
          <ReadOnlyScoreCard
            key={score.id}
            score={score}
            projectId={projectId}
            showLinkedSignal={false}
            compact
            feedbackPrefix={group.label}
          />
        )
      })}
    </div>
  )
}

function SignalGroupDetails({
  group,
  firstItem,
  scoresById,
  projectId,
  isUpdateLoading,
  onUpdate,
  onOpenDestination,
}: {
  readonly group: FindingGroup
  readonly firstItem: SessionAssessmentItem
  readonly scoresById: ReadonlyMap<string, ScoreRecord>
  readonly projectId: string
  readonly isUpdateLoading: boolean
  readonly onUpdate?: ((annotation: AnnotationRecord, data: AnnotationSaveData) => void) | undefined
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const signalId = group.signalId ?? ""
  const { data: signal, isLoading } = useSignal({ projectId, signalId })
  const title = signal?.name.trim() || group.label
  const description = signal?.description.trim()

  return (
    <div className="flex flex-col">
      <div className="flex min-w-0 items-start gap-4 px-4 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text.H6B>{title}</Text.H6B>
          {isLoading ? (
            <div className="flex flex-col gap-1 py-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : description ? (
            <Text.H6 color="foregroundMuted" className="whitespace-pre-wrap">
              {description}
            </Text.H6>
          ) : null}
        </div>
        {onOpenDestination ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto shrink-0 px-0 py-0"
            onClick={() => onOpenDestination({ kind: "signal", signalId }, firstItem)}
          >
            View signal
            <Icon icon={ArrowUpRightIcon} size="xs" />
          </Button>
        ) : null}
      </div>
      <div className="border-t border-border">
        <LinkedJudgments
          group={group}
          scoresById={scoresById}
          projectId={projectId}
          isUpdateLoading={isUpdateLoading}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  )
}

function FindingGroupRow({
  group,
  scoresById,
  signalsById,
  projectId,
  isUpdateLoading,
  onUpdate,
  onOpenDestination,
}: {
  readonly group: FindingGroup
  readonly scoresById: ReadonlyMap<string, ScoreRecord>
  readonly signalsById: ReadonlyMap<string, SessionSignalRecord>
  readonly projectId: string
  readonly isUpdateLoading: boolean
  readonly onUpdate?: ((annotation: AnnotationRecord, data: AnnotationSaveData) => void) | undefined
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails =
    group.scoreIds.length > 0 ||
    group.occurrenceCount > 1 ||
    group.items.some((item) => itemDescription(item) || primaryDestination(item))
  const firstItem = group.items[0]
  const signal = group.signalId ? signalsById.get(group.signalId) : undefined
  const signalState = signal ? getPrimaryLifecycleState(signal.states) : undefined
  const trailingValue = group.signalId
    ? signalState
      ? formatLifecycleLabel(signalState)
      : "Detected"
    : group.scoreIds.length === 0
      ? `${group.occurrenceCount} ${group.occurrenceCount === 1 ? "occurrence" : "occurrences"}`
      : group.polarity === "positive"
        ? "Positive"
        : group.polarity === "negative"
          ? "Negative"
          : "Review"
  const trailingValueClass = group.signalId
    ? signalStateTextClass(signalState, group.polarity)
    : polarityTextClass(group.polarity)
  const leading =
    group.signalId && firstItem && onOpenDestination ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Open signal ${group.label}`}
        className="hover:bg-background/60"
        onClick={() => onOpenDestination({ kind: "signal", signalId: group.signalId! }, firstItem)}
      >
        <Icon icon={ArrowUpRightIcon} size="xs" color="foregroundMuted" />
      </Button>
    ) : (
      <Icon
        icon={group.signalId ? ArrowUpRightIcon : polarityIcon(group.polarity)}
        size="xs"
        color={group.signalId ? "foregroundMuted" : polarityIconColor(group.polarity)}
      />
    )
  const trailing = (
    <>
      {group.scoreIds.length > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1 text-muted-foreground"
          title={`${group.scoreIds.length} linked ${group.scoreIds.length === 1 ? "annotation or evaluation" : "annotations or evaluations"}`}
        >
          <Icon icon={MessageSquareTextIcon} size="xs" color="foregroundMuted" />
          <span className="tabular-nums">{group.scoreIds.length}</span>
        </span>
      ) : null}
      <span className={cn("shrink-0 font-normal", trailingValueClass)}>{trailingValue}</span>
    </>
  )

  return (
    <div className="flex flex-col">
      <FindingRow
        label={group.label}
        leading={leading}
        trailing={trailing}
        expanded={expanded}
        {...(hasDetails ? { onToggle: () => setExpanded((current) => !current) } : {})}
      />
      {expanded ? (
        <div className="border-t border-border bg-background pl-6">
          {group.signalId && firstItem ? (
            <SignalGroupDetails
              group={group}
              firstItem={firstItem}
              scoresById={scoresById}
              projectId={projectId}
              isUpdateLoading={isUpdateLoading}
              onUpdate={onUpdate}
              onOpenDestination={onOpenDestination}
            />
          ) : group.scoreIds.length > 0 ? (
            <LinkedJudgments
              group={group}
              scoresById={scoresById}
              projectId={projectId}
              isUpdateLoading={isUpdateLoading}
              onUpdate={onUpdate}
            />
          ) : (
            <FindingOccurrences items={group.items} onOpenDestination={onOpenDestination} />
          )}
        </div>
      ) : null}
    </div>
  )
}

function FindingSlice({
  label,
  polarity,
  metrics,
  groups,
  scoresById,
  signalsById,
  projectId,
  isUpdateLoading,
  onUpdate,
  onOpenDestination,
  defaultExpanded,
}: {
  readonly label: string
  readonly polarity: SessionAssessmentPolarity
  readonly metrics: readonly FindingMetric[]
  readonly groups: readonly FindingGroup[]
  readonly scoresById: ReadonlyMap<string, ScoreRecord>
  readonly signalsById: ReadonlyMap<string, SessionSignalRecord>
  readonly projectId: string
  readonly isUpdateLoading: boolean
  readonly onUpdate?: ((annotation: AnnotationRecord, data: AnnotationSaveData) => void) | undefined
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
  readonly defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  if (metrics.length === 0 && groups.length === 0) return null
  const findingCount = metrics.length + groups.length

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/40">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-auto w-full rounded-none px-4 py-3 font-normal text-foreground hover:bg-secondary/80"
      >
        <button
          type="button"
          aria-label={label}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
          <span className={cn("shrink-0 font-medium", polarityTextClass(polarity))}>
            {findingCount} {findingCount === 1 ? "finding" : "findings"}
          </span>
          <Icon icon={expanded ? ChevronDownIcon : ChevronRightIcon} size="xs" color="foregroundMuted" />
        </button>
      </Button>
      {expanded ? (
        <div className="divide-y divide-border border-t border-border">
          {metrics.map((metric) => (
            <FindingMetricRow key={metric.key} metric={metric} polarity={polarity} />
          ))}
          {groups.map((group) => (
            <FindingGroupRow
              key={group.key}
              group={group}
              scoresById={scoresById}
              signalsById={signalsById}
              projectId={projectId}
              isUpdateLoading={isUpdateLoading}
              onUpdate={onUpdate}
              onOpenDestination={onOpenDestination}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SessionAssessmentContent({
  assessment,
  scores = [],
  signals = [],
  projectId = "",
  isUpdateLoading = false,
  onUpdate,
  onOpenDestination,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: {
  readonly assessment: SessionAssessment
  readonly scores?: readonly ScoreRecord[]
  readonly signals?: readonly SessionSignalRecord[]
  readonly projectId?: string
  readonly isUpdateLoading?: boolean
  readonly onUpdate?: ((annotation: AnnotationRecord, data: AnnotationSaveData) => void) | undefined
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
  readonly hasMore?: boolean
  readonly isLoadingMore?: boolean
  readonly onLoadMore?: (() => unknown) | undefined
}) {
  const scoresById = new Map(scores.map((score) => [score.id, score]))
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]))
  const groups = groupAssessmentItems(assessment.items, scores).filter((group) => !isSummaryOnlyGroup(group))
  const metrics = metricsByPolarity(assessment)
  const incompleteReaders = assessment.coverage.readers.filter(
    (reader) => reader.status === "partiallyExamined" || reader.status === "notExamined",
  )
  const incompleteReaderCount = incompleteReaders.length
  const coverageReasons = [
    ...new Set(
      incompleteReaders.flatMap((reader) =>
        "limitation" in reader ? [COVERAGE_LIMITATION_LABELS[reader.limitation] ?? []].flat() : [],
      ),
    ),
  ]
  const sections = [
    { polarity: "negative" as const, label: "Needs attention", defaultExpanded: true },
    { polarity: "unknown" as const, label: "Needs interpretation", defaultExpanded: true },
    { polarity: "positive" as const, label: "Positive evidence", defaultExpanded: false },
  ]
  const hasContent = sections.some(
    ({ polarity }) => metrics[polarity].length > 0 || groups.some((group) => group.polarity === polarity),
  )

  return (
    <div className="flex flex-col gap-3">
      {hasContent ? (
        sections.map(({ polarity, label, defaultExpanded }) => (
          <FindingSlice
            key={polarity}
            label={label}
            polarity={polarity}
            metrics={metrics[polarity]}
            groups={groups.filter((group) => group.polarity === polarity)}
            scoresById={scoresById}
            signalsById={signalsById}
            projectId={projectId}
            isUpdateLoading={isUpdateLoading}
            onUpdate={onUpdate}
            onOpenDestination={onOpenDestination}
            defaultExpanded={defaultExpanded}
          />
        ))
      ) : (
        <div className="rounded-xl bg-secondary/40 px-4 py-4">
          <Text.H6 color="foregroundMuted">No findings were detected for this session.</Text.H6>
        </div>
      )}
      {incompleteReaderCount > 0 ? (
        <Text.H7 color="foregroundMuted">
          {incompleteReaderCount === 1
            ? "One automated check could not fully examine this session"
            : `${incompleteReaderCount} automated checks could not fully examine this session`}
          {coverageReasons.length > 0 ? `: ${coverageReasons.join(", ")}.` : "."}
        </Text.H7>
      ) : null}
      {hasMore && onLoadMore ? (
        <div className="flex justify-center">
          <Button type="button" variant="link" size="sm" isLoading={isLoadingMore} onClick={onLoadMore}>
            Load more findings
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function SessionAssessmentSection({
  assessment,
  scores,
  signals,
  projectId,
  isLoading,
  isError,
  isUpdateLoading,
  onUpdate,
  onOpenDestination,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  readonly assessment: SessionAssessment | undefined
  readonly scores: readonly ScoreRecord[]
  readonly signals: readonly SessionSignalRecord[]
  readonly projectId: string
  readonly isLoading: boolean
  readonly isError: boolean
  readonly isUpdateLoading: boolean
  readonly onUpdate: (annotation: AnnotationRecord, data: AnnotationSaveData) => void
  readonly onOpenDestination?: SessionAssessmentDestinationHandler | undefined
  readonly hasMore: boolean
  readonly isLoadingMore: boolean
  readonly onLoadMore: () => unknown
}) {
  return (
    <div className="flex flex-col gap-3">
      <Text.H4M>Session findings</Text.H4M>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <Text.H6 color="foregroundMuted">Could not load the session findings.</Text.H6>
      ) : assessment ? (
        <SessionAssessmentContent
          key={assessment.sessionId}
          assessment={assessment}
          scores={scores}
          signals={signals}
          projectId={projectId}
          isUpdateLoading={isUpdateLoading}
          onUpdate={onUpdate}
          onOpenDestination={onOpenDestination}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </div>
  )
}
