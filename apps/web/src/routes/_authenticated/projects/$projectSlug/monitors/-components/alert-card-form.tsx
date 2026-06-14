import {
  type AlertSeverity,
  DEFAULT_ESCALATION_SENSITIVITY,
  type MonitorMetric,
  type MonitorMetricField,
} from "@domain/shared"
import { Badge, Button, Icon, Input, Select, type TabOption, Tabs, Text } from "@repo/ui"
import { EqualApproximately, LineDotRightHorizontal, SparklesIcon, TrendingUp, XIcon } from "lucide-react"
import { SeveritySelector } from "../../../../../../domains/alerts/severity-selector.tsx"
import { describeMonitorTarget } from "../../../../../../domains/monitors/monitor-target.ts"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import {
  type AlertDraft,
  type AlertFieldErrors,
  type BaselineKind,
  type ComparisonMode,
  draftWithKind,
  kindsForDraft,
  type LookbackUnit,
  previewAlertSentence,
  type UserAlertKind,
  type WindowUnit,
} from "./alert-form-helpers.ts"
import { SavedSearchSourcePicker } from "./saved-search-source-picker.tsx"

// Sensitivity is an integer 1–6 (shared with the seasonal escalation detector).
const SENSITIVITY_MIN = 1
const SENSITIVITY_MAX = 6
const EXPECTED_EXPLANATION =
  "The system will learn the patterns and seasonality from your trace history to find anomalies"

// Field help copy — written so a non-engineer can predict what each control does.
const KIND_HELP: Record<UserAlertKind, string> = {
  "savedSearch.match": "Alerts each time a new matching trace is detected",
  "savedSearch.threshold": "Alerts once matching traces reach a threshold",
  "savedSearch.escalating": "Alerts when matching traces stays elevated for a sustained window",
  "event.matched": "Alerts each time a new matching event is detected",
  "metric.threshold": "Alerts once the metric crosses a threshold",
  "metric.escalating": "Alerts when the metric stays elevated for a sustained window",
}

// The three tabs are kind-neutral (match/threshold/escalating); the concrete kind
// per position comes from the draft's mode (saved-search vs unified target).
const TAB_META: readonly { label: string; icon: typeof EqualApproximately }[] = [
  { label: "Match", icon: EqualApproximately },
  { label: "Threshold", icon: LineDotRightHorizontal },
  { label: "Escalating", icon: TrendingUp },
]

const isMatchKind = (kind: UserAlertKind): boolean => kind === "savedSearch.match" || kind === "event.matched"
const isEscalatingKind = (kind: UserAlertKind): boolean =>
  kind === "savedSearch.escalating" || kind === "metric.escalating"

type MetricAggregation = MonitorMetric["kind"]
const METRIC_AGGREGATION_OPTIONS: { label: string; value: MetricAggregation }[] = [
  { label: "Count", value: "count" },
  { label: "Error rate", value: "errorRate" },
  { label: "Average", value: "avg" },
  { label: "P95", value: "p95" },
  { label: "Sum", value: "sum" },
]
const METRIC_FIELD_OPTIONS: { label: string; value: MonitorMetricField }[] = [
  { label: "duration", value: "duration" },
  { label: "cost", value: "cost" },
  { label: "tokens", value: "tokens" },
]
const aggregationNeedsField = (kind: MetricAggregation): boolean => kind === "avg" || kind === "p95" || kind === "sum"

function MetricSelector({
  value,
  onChange,
  disabled,
}: {
  readonly value: MonitorMetric
  readonly onChange: (metric: MonitorMetric) => void
  readonly disabled?: boolean
}) {
  const field = "field" in value ? value.field : "duration"
  return (
    <div className="flex flex-col gap-1.5">
      <Text.H5M>Metric</Text.H5M>
      <div className="flex flex-wrap items-center gap-2">
        <Select<MetricAggregation>
          name="metricAggregation"
          width="auto"
          options={METRIC_AGGREGATION_OPTIONS}
          value={value.kind}
          onChange={(kind) => onChange(aggregationNeedsField(kind) ? { kind, field } : ({ kind } as MonitorMetric))}
          {...(disabled ? { disabled: true } : {})}
        />
        {aggregationNeedsField(value.kind) ? (
          <Select<MonitorMetricField>
            name="metricField"
            width="auto"
            options={METRIC_FIELD_OPTIONS}
            value={field}
            onChange={(nextField) => onChange({ kind: value.kind, field: nextField } as MonitorMetric)}
            {...(disabled ? { disabled: true } : {})}
          />
        ) : null}
      </div>
    </div>
  )
}

function TargetChip({ target }: { readonly target: NonNullable<AlertDraft["target"]> }) {
  const description = describeMonitorTarget(target)
  return (
    <div className="flex flex-col gap-1.5">
      <Text.H5M>Target</Text.H5M>
      <div>
        <Badge variant="muted">{description?.label ?? target.stream}</Badge>
      </div>
    </div>
  )
}

// Severity is a triage label: it sets the priority shown on the incidents this
// alert opens (incident lists, chart markers, notifications) — it doesn't
// change when or how the alert fires.
const SEVERITY_HELP: Record<AlertSeverity, string> = {
  low: "Incidents open as low priority — informational, review when convenient",
  medium: "Incidents open as medium priority — worth attention soon",
  high: "Incidents open as high priority — needs immediate attention",
}

const COMPARISON_OPTIONS: { label: string; value: ComparisonMode }[] = [
  { label: "times", value: "times" },
  { label: "times more than", value: "timesMoreThan" },
]

// Unified metric thresholds read "the metric is N or higher" / "N times more than …".
const TARGET_COMPARISON_OPTIONS: { label: string; value: ComparisonMode }[] = [
  { label: "or higher", value: "times" },
  { label: "times more than", value: "timesMoreThan" },
]

const BASELINE_KIND_OPTIONS: { label: string; value: BaselineKind }[] = [
  { label: "the average of the last", value: "average" },
  { label: "the previous", value: "period" },
  { label: "expected", value: "expected" },
]

const LOOKBACK_UNIT_OPTIONS: { label: string; value: LookbackUnit }[] = [
  { label: "hours", value: "hours" },
  { label: "days", value: "days" },
]

const WINDOW_UNIT_OPTIONS: { label: string; value: WindowUnit }[] = [
  { label: "minutes", value: "minutes" },
  { label: "hours", value: "hours" },
  { label: "days", value: "days" },
]

function FieldErrors({ errors }: { readonly errors?: readonly string[] | undefined }) {
  if (!errors?.length) return null
  return (
    <div className="mt-1 flex flex-col gap-1" role="alert">
      {errors.map((error) => (
        <Text.H6 key={error} color="destructive">
          {error}
        </Text.H6>
      ))}
    </div>
  )
}

function ThresholdWindowForm({
  value,
  onChange,
  disabled,
  errors,
}: {
  readonly value: AlertDraft
  readonly onChange: (patch: Partial<AlertDraft>) => void
  readonly disabled?: boolean
  readonly errors?: AlertFieldErrors | undefined
}) {
  const targetMode = value.target !== null
  const relative = value.comparison === "timesMoreThan"
  const expected = relative && value.baselineKind === "expected"
  const hasLookback = relative && !expected
  // Unified metric thresholds are floats (error rate 0.1, p95 latency…); counts are whole numbers.
  const amountStep = expected ? 1 : relative || targetMode ? 0.1 : 1
  const amountMin = expected ? SENSITIVITY_MIN : targetMode && !relative ? 0 : 1
  const comparisonOptions = targetMode ? TARGET_COMPARISON_OPTIONS : COMPARISON_OPTIONS
  const leadIn = targetMode ? "Alert when the metric is" : "Alert when traces are detected"

  // The amount doubles as the sensitivity in expected mode; snap an out-of-range
  // count/factor onto a valid 1–6 default when switching so the field stays valid.
  const onBaselineKindChange = (baselineKind: BaselineKind) => {
    const needsSensitivityReset =
      baselineKind === "expected" &&
      (!Number.isInteger(value.amount) || value.amount < SENSITIVITY_MIN || value.amount > SENSITIVITY_MAX)
    onChange(needsSensitivityReset ? { baselineKind, amount: DEFAULT_ESCALATION_SENSITIVITY } : { baselineKind })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <Text.H5M>Threshold</Text.H5M>
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <Text.H5 color="foregroundMuted">{leadIn}</Text.H5>
          <Input
            type="number"
            min={amountMin}
            max={expected ? SENSITIVITY_MAX : undefined}
            step={amountStep}
            value={value.amount}
            onChange={(event) => onChange({ amount: Number(event.target.value) })}
            className="w-20 h-9"
            {...(disabled ? { disabled: true } : {})}
          />
          <Select<ComparisonMode>
            name="comparison"
            width="auto"
            options={comparisonOptions}
            value={value.comparison}
            onChange={(comparison) => onChange({ comparison })}
            {...(disabled ? { disabled: true } : {})}
          />
          {relative ? (
            <Select<BaselineKind>
              name="baselineKind"
              width="auto"
              options={BASELINE_KIND_OPTIONS}
              value={value.baselineKind}
              onChange={onBaselineKindChange}
              {...(disabled ? { disabled: true } : {})}
            />
          ) : null}
          {hasLookback ? (
            <Input
              type="number"
              min={1}
              step={1}
              value={value.lookbackAmount}
              onChange={(event) => onChange({ lookbackAmount: Number(event.target.value) })}
              className="w-20 h-9"
              {...(disabled ? { disabled: true } : {})}
            />
          ) : null}
          {hasLookback ? (
            <Select<LookbackUnit>
              name="lookbackUnit"
              width="auto"
              options={LOOKBACK_UNIT_OPTIONS}
              value={value.lookbackUnit}
              onChange={(lookbackUnit) => onChange({ lookbackUnit })}
              {...(disabled ? { disabled: true } : {})}
            />
          ) : null}
        </div>
        <FieldErrors errors={errors?.threshold} />
        {expected ? (
          <div className="rounded-lg bg-muted/80 px-3 py-2 flex justify-start items-start gap-2 mt-3">
            <Icon icon={SparklesIcon} size="sm" color="foregroundMuted" className="shrink-0" />
            <Text.H6 color="foregroundMuted">{EXPECTED_EXPLANATION}</Text.H6>
          </div>
        ) : null}
      </div>

      {isEscalatingKind(value.kind) ? (
        <div className="flex flex-col">
          <Text.H5M>Window</Text.H5M>
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <Text.H5 color="foregroundMuted">Sustained for at least</Text.H5>
            <Input
              type="number"
              min={1}
              value={value.windowAmount}
              onChange={(event) => onChange({ windowAmount: Number(event.target.value) })}
              className="w-20 h-9"
              {...(disabled ? { disabled: true } : {})}
            />
            <Select<WindowUnit>
              name="windowUnit"
              width="auto"
              options={WINDOW_UNIT_OPTIONS}
              value={value.windowUnit}
              onChange={(windowUnit) => onChange({ windowUnit })}
              {...(disabled ? { disabled: true } : {})}
            />
          </div>
          <FieldErrors errors={errors?.window} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Controlled editor for a single alert. Saved-search mode shows the saved-search
 * picker; unified (tool/user/raw-stream) mode — when the draft has a `target` —
 * shows a read-only target chip and a metric selector. Switching the tab resets
 * the threshold/window fields.
 */
export function AlertCardForm({
  value,
  onChange,
  projectId,
  projectSlug,
  disabled,
  onRemove,
  errors,
  showSourcePicker = true,
  sourceName,
  metricReadonly = false,
}: {
  readonly value: AlertDraft
  readonly onChange: (next: AlertDraft) => void
  readonly projectId: string
  readonly projectSlug: string
  readonly disabled?: boolean
  readonly onRemove?: () => void
  readonly errors?: AlertFieldErrors
  /** Hide the saved-search picker when the caller fixes the source (e.g. the search being created in the save-search modal). */
  readonly showSourcePicker?: boolean
  /** Preview-sentence name override for sources that don't exist yet (paired with `showSourcePicker: false`). */
  readonly sourceName?: string
  /** Lock the metric (set at creation; the firing path reads it off the monitor target). Used when editing an existing unified monitor. */
  readonly metricReadonly?: boolean
}) {
  const targetMode = value.target !== null
  const { data: savedSearches } = useSavedSearchesList(projectId, { enabled: showSourcePicker && !targetMode })
  const savedSearchName =
    sourceName ?? (value.sourceId ? savedSearches.find((search) => search.id === value.sourceId)?.name : undefined)

  const set = (patch: Partial<AlertDraft>) => onChange({ ...value, ...patch })

  const kinds = kindsForDraft(value)
  const kindTabs: readonly TabOption<UserAlertKind>[] = TAB_META.map((meta, index) => ({
    id: kinds[index],
    label: meta.label,
    icon: <Icon icon={meta.icon} size="sm" />,
  }))

  const removeButton = (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove} aria-label="Remove alert">
      <Icon icon={XIcon} size="sm" color="foregroundMuted" />
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Tabs<UserAlertKind>
            variant="secondary"
            size="sm"
            options={kindTabs}
            active={value.kind}
            onSelect={(kind) => {
              if (!disabled) onChange(draftWithKind(value, kind))
            }}
          />
          {onRemove ? removeButton : null}
        </div>
        <Text.H6 color="foregroundMuted">{KIND_HELP[value.kind]}</Text.H6>
      </div>

      {targetMode && value.target ? <TargetChip target={value.target} /> : null}

      {targetMode && !isMatchKind(value.kind) ? (
        <MetricSelector
          value={value.metric}
          onChange={(metric) => set({ metric })}
          {...(disabled || metricReadonly ? { disabled: true } : {})}
        />
      ) : null}

      {!targetMode && showSourcePicker ? (
        <SavedSearchSourcePicker
          projectId={projectId}
          projectSlug={projectSlug}
          value={value.sourceId}
          onChange={(sourceId) => set({ sourceId })}
          {...(disabled ? { disabled: true } : {})}
          {...(errors?.source ? { errors: [...errors.source] } : {})}
        />
      ) : null}

      {!isMatchKind(value.kind) ? (
        <ThresholdWindowForm value={value} onChange={set} errors={errors} {...(disabled ? { disabled: true } : {})} />
      ) : null}

      <div className="rounded-lg bg-muted/80 px-3 py-2 flex justify-start items-center">
        <Text.H6 color="foregroundMuted">{previewAlertSentence(value, savedSearchName)}</Text.H6>
      </div>

      <div className="flex flex-col gap-1.5">
        <Text.H5M>Severity</Text.H5M>
        <SeveritySelector
          value={value.severity}
          onSelect={(severity) => set({ severity })}
          {...(disabled ? { disabled: true } : {})}
        />
        <Text.H6 color="foregroundMuted">{SEVERITY_HELP[value.severity]}</Text.H6>
      </div>
    </div>
  )
}
