import { ALERT_SEVERITIES, type AlertSeverity, DEFAULT_ESCALATION_SENSITIVITY } from "@domain/shared"
import { Icon, Input, Select, Text } from "@repo/ui"
import { SparklesIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import {
  type AlertDraft,
  type BaselineKind,
  type ComparisonMode,
  type LookbackUnit,
  previewAlertSentence,
  USER_ALERT_KIND_LABEL,
  USER_ALERT_KINDS,
  type UserAlertKind,
  type WindowUnit,
} from "./alert-form-helpers.ts"
import { HelpTooltip } from "./help-tooltip.tsx"
import { SavedSearchSourcePicker } from "./saved-search-source-picker.tsx"

// Sensitivity is an integer 1–6 (shared with the seasonal escalation detector).
const SENSITIVITY_MIN = 1
const SENSITIVITY_MAX = 6
const EXPECTED_EXPLANATION =
  "'Expected' is a smart baseline Latitude learns from your history — the normal shape of your traffic for each time of day and day of week, so a quiet Sunday night and a busy Monday morning each get their own 'normal'. You don't pick a comparison window, just how sensitive to be (1–6, lower = more sensitive). It's the same engine behind automatic issue-escalation."

// Field help copy — written so a non-engineer can predict what each control does.
const KIND_HELP: Record<UserAlertKind, string> = {
  "savedSearch.match":
    "Alerts each time a new matching trace is detected (throttled to at most one alert every 5 minutes).",
  "savedSearch.threshold":
    "Alerts once matching traces reach a threshold — a fixed count, or a multiple of a baseline.",
  "savedSearch.escalating":
    "Alerts when matching traffic stays elevated for a sustained window, filtering out short spikes.",
}
const COMPARISON_HELP =
  "'times' compares against a fixed number. 'times more than' compares against a baseline — a recent average, the equivalent previous window, or the dynamically-learned expected level."
const BASELINE_HELP =
  "What to compare current activity against. 'The average of the last …' uses your typical rate over a recent window (robust to one-off past spikes). 'The previous …' compares against the equally-long window just before now — better when traffic has daily or weekly cycles. 'Expected' is a smart baseline learned automatically from your history (per time-of-day × day-of-week) — the same engine behind automatic issue-escalation; you pick no window, only a sensitivity."
const WINDOW_HELP =
  "How long the condition must hold continuously before firing — and how long it must stop holding before the incident closes. Short windows catch quick spikes; long windows ignore transient noise. Minimum 5 minutes."

const SEVERITY_OPTIONS = ALERT_SEVERITIES.map((severity) => ({
  label: severity[0].toUpperCase() + severity.slice(1),
  value: severity,
}))

const COMPARISON_OPTIONS: { label: string; value: ComparisonMode }[] = [
  { label: "times", value: "times" },
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

function FieldLabel({ children, help }: { readonly children: ReactNode; readonly help: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <Text.H6M>{children}</Text.H6M>
      <HelpTooltip>{help}</HelpTooltip>
    </div>
  )
}

function ThresholdWindowForm({
  value,
  onChange,
  disabled,
}: {
  readonly value: AlertDraft
  readonly onChange: (patch: Partial<AlertDraft>) => void
  readonly disabled?: boolean
}) {
  const relative = value.comparison === "timesMoreThan"
  const expected = relative && value.baselineKind === "expected"
  const hasLookback = relative && !expected

  // The amount doubles as the sensitivity in expected mode; snap an out-of-range
  // count/factor onto a valid 1–6 default when switching so the field stays valid.
  const onBaselineKindChange = (baselineKind: BaselineKind) => {
    const needsSensitivityReset =
      baselineKind === "expected" &&
      (!Number.isInteger(value.amount) || value.amount < SENSITIVITY_MIN || value.amount > SENSITIVITY_MAX)
    onChange(needsSensitivityReset ? { baselineKind, amount: DEFAULT_ESCALATION_SENSITIVITY } : { baselineKind })
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex flex-col gap-1.5">
        <FieldLabel help={COMPARISON_HELP}>Threshold</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Text.H6 color="foregroundMuted">Alert when traces are detected</Text.H6>
          <Input
            type="number"
            min={expected ? SENSITIVITY_MIN : 1}
            max={expected ? SENSITIVITY_MAX : undefined}
            step={relative && !expected ? 0.1 : 1}
            value={value.amount}
            onChange={(event) => onChange({ amount: Number(event.target.value) })}
            className="w-20"
            {...(disabled ? { disabled: true } : {})}
          />
          <Select<ComparisonMode>
            name="comparison"
            width="auto"
            options={COMPARISON_OPTIONS}
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
              className="w-20"
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
          {relative ? <HelpTooltip>{BASELINE_HELP}</HelpTooltip> : null}
        </div>
        {expected ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2">
            <Icon icon={SparklesIcon} size="sm" color="foregroundMuted" className="shrink-0" />
            <Text.H6 color="foregroundMuted">{EXPECTED_EXPLANATION}</Text.H6>
          </div>
        ) : null}
      </div>

      {value.kind === "savedSearch.escalating" ? (
        <div className="flex flex-col gap-1.5">
          <FieldLabel help={WINDOW_HELP}>Window</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Text.H6 color="foregroundMuted">sustained for at least</Text.H6>
            <Input
              type="number"
              min={1}
              value={value.windowAmount}
              onChange={(event) => onChange({ windowAmount: Number(event.target.value) })}
              className="w-20"
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
        </div>
      ) : null}
    </div>
  )
}

/**
 * Controlled editor for a single saved-search alert, shared by the create modal
 * and the details-panel Alerts section. `lockKind` disables the kind dropdown
 * for in-place panel edits (kind is immutable once an alert exists).
 */
export function AlertCardForm({
  value,
  onChange,
  projectId,
  projectSlug,
  disabled,
  lockKind,
}: {
  readonly value: AlertDraft
  readonly onChange: (next: AlertDraft) => void
  readonly projectId: string
  readonly projectSlug: string
  readonly disabled?: boolean
  readonly lockKind?: boolean
}) {
  const { data: savedSearches } = useSavedSearchesList(projectId)
  const savedSearchName = value.sourceId
    ? savedSearches.find((search) => search.id === value.sourceId)?.name
    : undefined

  const set = (patch: Partial<AlertDraft>) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-3">
      <Select<UserAlertKind>
        name="kind"
        label="Alert type"
        info={KIND_HELP[value.kind]}
        options={USER_ALERT_KINDS.map((kind) => ({ label: USER_ALERT_KIND_LABEL[kind], value: kind }))}
        value={value.kind}
        onChange={(kind) => set({ kind })}
        {...(disabled || lockKind ? { disabled: true } : {})}
      />

      <SavedSearchSourcePicker
        projectId={projectId}
        projectSlug={projectSlug}
        value={value.sourceId}
        onChange={(sourceId) => set({ sourceId })}
        {...(disabled ? { disabled: true } : {})}
      />

      {value.kind !== "savedSearch.match" ? (
        <ThresholdWindowForm value={value} onChange={set} {...(disabled ? { disabled: true } : {})} />
      ) : null}

      <Select<AlertSeverity>
        name="severity"
        label="Severity"
        options={SEVERITY_OPTIONS}
        value={value.severity}
        onChange={(severity) => set({ severity })}
        {...(disabled ? { disabled: true } : {})}
      />

      <div className="rounded-md bg-muted/60 px-3 py-2">
        <Text.H6 color="foregroundMuted">{previewAlertSentence(value, savedSearchName)}</Text.H6>
      </div>
    </div>
  )
}
