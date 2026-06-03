import { type AlertSeverity, DEFAULT_ESCALATION_SENSITIVITY } from "@domain/shared"
import { Button, Icon, Input, Select, type TabOption, Tabs, Text } from "@repo/ui"
import {
  CircleArrowDown,
  CircleArrowUp,
  CircleMinus,
  EqualApproximately,
  LineDotRightHorizontal,
  SparklesIcon,
  TrendingUp,
  XIcon,
} from "lucide-react"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import {
  type AlertDraft,
  type AlertFieldErrors,
  type BaselineKind,
  type ComparisonMode,
  draftWithKind,
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
}

const KIND_TABS: readonly TabOption<UserAlertKind>[] = [
  { id: "savedSearch.match", label: "Match", icon: <Icon icon={EqualApproximately} size="sm" /> },
  { id: "savedSearch.threshold", label: "Threshold", icon: <Icon icon={LineDotRightHorizontal} size="sm" /> },
  { id: "savedSearch.escalating", label: "Escalating", icon: <Icon icon={TrendingUp} size="sm" /> },
]

const SEVERITY_TABS: readonly TabOption<AlertSeverity>[] = [
  { id: "low", label: "Low", icon: <Icon icon={CircleArrowDown} size="sm" /> },
  { id: "medium", label: "Medium", icon: <Icon icon={CircleMinus} size="sm" /> },
  { id: "high", label: "High", icon: <Icon icon={CircleArrowUp} size="sm" /> },
]

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <Text.H5M>Threshold</Text.H5M>
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <Text.H5 color="foregroundMuted">Alert when traces are detected</Text.H5>
          <Input
            type="number"
            min={expected ? SENSITIVITY_MIN : 1}
            max={expected ? SENSITIVITY_MAX : undefined}
            step={relative && !expected ? 0.1 : 1}
            value={value.amount}
            onChange={(event) => onChange({ amount: Number(event.target.value) })}
            className="w-20 h-9"
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

      {value.kind === "savedSearch.escalating" ? (
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

/** Controlled editor for a single saved-search alert; switching the kind resets the threshold/window fields. */
export function AlertCardForm({
  value,
  onChange,
  projectId,
  projectSlug,
  disabled,
  onRemove,
  errors,
}: {
  readonly value: AlertDraft
  readonly onChange: (next: AlertDraft) => void
  readonly projectId: string
  readonly projectSlug: string
  readonly disabled?: boolean
  readonly onRemove?: () => void
  readonly errors?: AlertFieldErrors
}) {
  const { data: savedSearches } = useSavedSearchesList(projectId)
  const savedSearchName = value.sourceId
    ? savedSearches.find((search) => search.id === value.sourceId)?.name
    : undefined

  const set = (patch: Partial<AlertDraft>) => onChange({ ...value, ...patch })

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
            options={KIND_TABS}
            active={value.kind}
            onSelect={(kind) => {
              if (!disabled) onChange(draftWithKind(value, kind))
            }}
          />
          {onRemove ? removeButton : null}
        </div>
        <Text.H6 color="foregroundMuted">{KIND_HELP[value.kind]}</Text.H6>
      </div>

      <SavedSearchSourcePicker
        projectId={projectId}
        projectSlug={projectSlug}
        value={value.sourceId}
        onChange={(sourceId) => set({ sourceId })}
        {...(disabled ? { disabled: true } : {})}
        {...(errors?.source ? { errors: [...errors.source] } : {})}
      />

      {value.kind !== "savedSearch.match" ? (
        <ThresholdWindowForm value={value} onChange={set} errors={errors} {...(disabled ? { disabled: true } : {})} />
      ) : null}

      <div className="rounded-lg bg-muted/80 px-3 py-2 flex justify-start items-center">
        <Text.H6 color="foregroundMuted">{previewAlertSentence(value, savedSearchName)}</Text.H6>
      </div>

      <Tabs<AlertSeverity>
        variant="secondary"
        size="sm"
        options={SEVERITY_TABS}
        active={value.severity}
        onSelect={(severity) => {
          if (!disabled) set({ severity })
        }}
      />
    </div>
  )
}
