import {
  type EvaluationRuleCondition,
  type MetricField,
  SEMANTIC_SIMILARITY_PRESETS,
  type SemanticSimilarityPreset,
} from "@domain/shared"
import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  FormField,
  Input,
  Select,
  Slider,
  SwitchInput,
  Text,
} from "@repo/ui"
import { type ReactNode, useRef, useState } from "react"
import { useTraceDistinctValues } from "../../../../../../../domains/traces/traces.collection.ts"

type ConditionType = EvaluationRuleCondition["type"]
type ConditionOf<T extends ConditionType> = Extract<EvaluationRuleCondition, { type: T }>

const SCOPE_OPTIONS: ReadonlyArray<{ label: string; value: ConditionOf<"text_match">["scope"] }> = [
  { label: "Last assistant message", value: "last_assistant" },
  { label: "Any assistant message", value: "any_assistant" },
  { label: "Any user message", value: "any_user" },
  { label: "Any tool message", value: "any_tool" },
  { label: "Whole conversation", value: "conversation" },
]

const TEXT_OPERATOR_OPTIONS: ReadonlyArray<{ label: string; value: ConditionOf<"text_match">["operator"] }> = [
  { label: "Contains", value: "contains" },
  { label: "Does not contain", value: "not_contains" },
  { label: "Matches regex", value: "matches_regex" },
  { label: "Does not match regex", value: "not_matches_regex" },
]

type ComparisonOp = ConditionOf<"output_length">["operator"]
const COMPARISON_OPTIONS: ReadonlyArray<{ label: string; value: ComparisonOp }> = [
  { label: "Greater than", value: "gt" },
  { label: "At least", value: "gte" },
  { label: "Less than", value: "lt" },
  { label: "At most", value: "lte" },
]
const COMPARISON_SYMBOL: Record<ComparisonOp, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" }

const LENGTH_UNIT_OPTIONS: ReadonlyArray<{ label: string; value: ConditionOf<"output_length">["unit"] }> = [
  { label: "Characters", value: "chars" },
  { label: "Words", value: "words" },
]

const SEMANTIC_PRESET_OPTIONS: ReadonlyArray<{ label: string; value: SemanticSimilarityPreset | "custom" }> = [
  { label: "Broad", value: "broad" },
  { label: "Balanced", value: "balanced" },
  { label: "Strict", value: "strict" },
]
const presetForThreshold = (threshold: number): SemanticSimilarityPreset | "custom" =>
  SEMANTIC_PRESET_OPTIONS.find(
    (option) => SEMANTIC_SIMILARITY_PRESETS[option.value as SemanticSimilarityPreset] === threshold,
  )?.value ?? "custom"

const JSON_EXPECTATION_OPTIONS: ReadonlyArray<{ label: string; value: ConditionOf<"json_output">["expectation"] }> = [
  { label: "Valid JSON", value: "valid" },
  { label: "Invalid JSON", value: "invalid" },
]

const METRIC_AGGREGATION_OPTIONS: ReadonlyArray<{ label: string; value: ConditionOf<"metric">["aggregation"] }> = [
  { label: "Session total", value: "session" },
  { label: "Any trace", value: "anyTrace" },
  { label: "All traces", value: "allTraces" },
]

const METRIC_FIELDS: ReadonlyArray<{
  field: MetricField
  label: string
  unit: string
  /** Friendly→stored multiplier. duration: ms→ns; cost: $→microcents; counts: raw. */
  factor: number
}> = [
  { field: "duration", label: "Duration", unit: "ms", factor: 1_000_000 },
  { field: "cost", label: "Cost", unit: "$", factor: 100_000_000 },
  { field: "tokensTotal", label: "Total tokens", unit: "tokens", factor: 1 },
  { field: "tokensInput", label: "Input tokens", unit: "tokens", factor: 1 },
  { field: "tokensOutput", label: "Output tokens", unit: "tokens", factor: 1 },
  { field: "errorCount", label: "Error count", unit: "", factor: 1 },
  { field: "traceCount", label: "Trace count", unit: "", factor: 1 },
  { field: "spanCount", label: "Span count", unit: "", factor: 1 },
]

const metricMeta = (field: MetricField) => METRIC_FIELDS.find((m) => m.field === field) ?? METRIC_FIELDS[0]
const metricValueToStored = (display: number, field: MetricField): number => display * metricMeta(field).factor
const metricValueFromStored = (stored: number, field: MetricField): number => stored / metricMeta(field).factor

const metricFieldLabel = (field: MetricField) => metricMeta(field).label

interface EditorProps<T extends ConditionType> {
  readonly condition: ConditionOf<T>
  readonly onChange: (next: ConditionOf<T>) => void
  readonly projectId: string
}

const FINISH_REASON_SUGGESTIONS = ["stop", "length", "tool_calls", "content_filter", "error"] as const

/**
 * Single-value combobox over the design-system `Combobox`: suggests known values and accepts
 * free text via a "Use …" item, so a value that isn't in the suggestions can still be entered.
 */
function SuggestiveCombobox({
  label,
  placeholder,
  value,
  onChange,
  suggestions,
}: {
  readonly label: string
  readonly placeholder?: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly suggestions: readonly string[]
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Portal the popup into an element inside the modal so the dialog's pointer/focus layer
  // doesn't treat clicks on the popup as "outside" (which would dismiss it without selecting).
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [search, setSearch] = useState("")
  const trimmed = search.trim()
  const hasExact = suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())
  const items = trimmed.length > 0 && !hasExact ? [trimmed, ...suggestions] : [...suggestions]

  return (
    <FormField label={label}>
      <div className="relative">
        <div ref={setContainerEl} aria-hidden className="absolute left-0 top-0" />
        <Combobox<string>
          value={value.length > 0 ? value : null}
          onValueChange={(picked) => {
            onChange(picked ?? "")
            setSearch("")
          }}
          items={items}
          itemToStringValue={(item) => item}
          isItemEqualToValue={(a, b) => a === b}
        >
          <Button asChild variant="outline" className="w-full justify-between">
            <ComboboxTrigger ref={triggerRef}>
              {value.length > 0 ? (
                <Text.H5>{value}</Text.H5>
              ) : (
                <Text.H5 color="foregroundMuted">{placeholder ?? "Select…"}</Text.H5>
              )}
            </ComboboxTrigger>
          </Button>
          <ComboboxContent anchor={triggerRef} container={containerEl}>
            <ComboboxInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              {...(placeholder ? { placeholder } : {})}
            />
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem value={item}>
                  <Text.H5>{!hasExact && item === trimmed ? `Use “${item}”` : item}</Text.H5>
                </ComboboxItem>
              )}
            </ComboboxList>
            <ComboboxEmpty>Type to add a value.</ComboboxEmpty>
          </ComboboxContent>
        </Combobox>
      </div>
    </FormField>
  )
}

/** Tool-name field that suggests the project's known tool names (free text allowed). */
function ToolNameField({
  projectId,
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly projectId: string
  readonly label: string
  readonly placeholder?: string
  readonly value: string
  readonly onChange: (next: string) => void
}) {
  const { data: tools = [] } = useTraceDistinctValues({ projectId, column: "tools" })
  return (
    <SuggestiveCombobox
      label={label}
      value={value}
      onChange={onChange}
      suggestions={tools}
      {...(placeholder ? { placeholder } : {})}
    />
  )
}

export interface ConditionTypeMeta<T extends ConditionType = ConditionType> {
  readonly label: string
  readonly description: string
  readonly create: () => ConditionOf<T>
  readonly summarize: (condition: ConditionOf<T>) => string
  readonly Editor: (props: EditorProps<T>) => ReactNode
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  errors,
}: {
  readonly label: string
  readonly value: number
  readonly onChange: (next: number) => void
  readonly unit?: string
  readonly errors?: string[]
}) {
  return (
    <div className="flex items-end gap-2">
      <Input
        type="number"
        label={label}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        {...(errors ? { errors } : {})}
      />
      {unit ? <span className="pb-2 text-sm text-muted-foreground">{unit}</span> : null}
    </div>
  )
}

/** Operator select + numeric value, shared by the output-length, tool-call-count, and metric editors. */
function ComparisonRow({
  operator,
  value,
  unit,
  onOperatorChange,
  onValueChange,
}: {
  readonly operator: ComparisonOp
  readonly value: number
  readonly unit?: string
  readonly onOperatorChange: (next: ComparisonOp) => void
  readonly onValueChange: (next: number) => void
}) {
  return (
    <>
      <Select
        name="comparison-operator"
        label="Operator"
        options={[...COMPARISON_OPTIONS]}
        value={operator}
        onChange={onOperatorChange}
      />
      <NumberField label="Value" value={value} {...(unit !== undefined ? { unit } : {})} onChange={onValueChange} />
    </>
  )
}

function regexError(operator: ConditionOf<"text_match">["operator"], value: string): string[] | undefined {
  if (operator !== "matches_regex" && operator !== "not_matches_regex") return undefined
  if (value.length === 0) return undefined
  try {
    new RegExp(value)
    return undefined
  } catch {
    return ["Invalid regular expression"]
  }
}

const text_match: ConditionTypeMeta<"text_match"> = {
  label: "Text match",
  description: "Match text in conversation messages by substring or regex.",
  create: () => ({
    type: "text_match",
    scope: "last_assistant",
    operator: "contains",
    value: "",
    caseSensitive: false,
  }),
  summarize: (c) => {
    const op = TEXT_OPERATOR_OPTIONS.find((o) => o.value === c.operator)?.label ?? c.operator
    const scope = SCOPE_OPTIONS.find((o) => o.value === c.scope)?.label ?? c.scope
    return `${scope} ${op.toLowerCase()} "${c.value}"`
  },
  Editor: ({ condition, onChange }) => (
    <div className="flex flex-col gap-3">
      <Select
        name="text-match-scope"
        label="Where"
        options={[...SCOPE_OPTIONS]}
        value={condition.scope}
        onChange={(scope) => onChange({ ...condition, scope })}
      />
      <Select
        name="text-match-operator"
        label="Operator"
        options={[...TEXT_OPERATOR_OPTIONS]}
        value={condition.operator}
        onChange={(operator) => onChange({ ...condition, operator })}
      />
      <Input
        label="Value"
        placeholder="e.g. I don't know"
        value={condition.value}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
        {...(regexError(condition.operator, condition.value)
          ? { errors: regexError(condition.operator, condition.value) }
          : {})}
      />
      <SwitchInput
        label="Case sensitive"
        checked={condition.caseSensitive ?? false}
        onCheckedChange={(caseSensitive) => onChange({ ...condition, caseSensitive })}
      />
    </div>
  ),
}

const empty_output: ConditionTypeMeta<"empty_output"> = {
  label: "Empty output",
  description: "The assistant produced no output.",
  create: () => ({ type: "empty_output" }),
  summarize: () => "Assistant output is empty",
  Editor: () => null,
}

const output_length: ConditionTypeMeta<"output_length"> = {
  label: "Output length",
  description: "Compare the assistant output length in characters or words.",
  create: () => ({ type: "output_length", unit: "chars", operator: "gt", value: 0 }),
  summarize: (c) => `Output length ${COMPARISON_SYMBOL[c.operator]} ${c.value} ${c.unit}`,
  Editor: ({ condition, onChange }) => (
    <div className="flex flex-col gap-3">
      <Select
        name="output-length-unit"
        label="Unit"
        options={[...LENGTH_UNIT_OPTIONS]}
        value={condition.unit}
        onChange={(unit) => onChange({ ...condition, unit })}
      />
      <ComparisonRow
        operator={condition.operator}
        value={condition.value}
        onOperatorChange={(operator) => onChange({ ...condition, operator })}
        onValueChange={(value) => onChange({ ...condition, value })}
      />
    </div>
  ),
}

const json_output: ConditionTypeMeta<"json_output"> = {
  label: "JSON output",
  description: "The assistant output is valid or invalid JSON.",
  create: () => ({ type: "json_output", expectation: "valid" }),
  summarize: (c) => `Output is ${c.expectation} JSON`,
  Editor: ({ condition, onChange }) => (
    <Select
      name="json-output-expectation"
      label="Expectation"
      options={[...JSON_EXPECTATION_OPTIONS]}
      value={condition.expectation}
      onChange={(expectation) => onChange({ ...condition, expectation })}
    />
  ),
}

const metric: ConditionTypeMeta<"metric"> = {
  label: "Metric",
  description: "Compare a session/trace metric like duration, cost, or tokens.",
  create: () => ({ type: "metric", field: "duration", aggregation: "session", operator: "gt", value: 0 }),
  summarize: (c) => {
    const meta = metricMeta(c.field)
    const display = metricValueFromStored(c.value, c.field)
    return `${metricFieldLabel(c.field)} ${COMPARISON_SYMBOL[c.operator]} ${display}${meta.unit ? ` ${meta.unit}` : ""}`
  },
  Editor: ({ condition, onChange }) => {
    const meta = metricMeta(condition.field)
    const display = metricValueFromStored(condition.value, condition.field)
    const aggregationLocked = condition.field === "traceCount"
    return (
      <div className="flex flex-col gap-3">
        <Select
          name="metric-field"
          label="Metric"
          options={METRIC_FIELDS.map((m) => ({ label: m.label, value: m.field }))}
          value={condition.field}
          onChange={(field) =>
            onChange({
              ...condition,
              field,
              // traceCount has no per-trace projection — force session aggregation.
              ...(field === "traceCount" ? { aggregation: "session" as const } : {}),
              value: metricValueToStored(display, field),
            })
          }
        />
        <Select
          name="metric-aggregation"
          label="Aggregation"
          options={[...METRIC_AGGREGATION_OPTIONS]}
          value={condition.aggregation}
          disabled={aggregationLocked}
          onChange={(aggregation) => onChange({ ...condition, aggregation })}
        />
        <ComparisonRow
          operator={condition.operator}
          value={display}
          {...(meta.unit !== undefined ? { unit: meta.unit } : {})}
          onOperatorChange={(operator) => onChange({ ...condition, operator })}
          onValueChange={(next) => onChange({ ...condition, value: metricValueToStored(next, condition.field) })}
        />
      </div>
    )
  },
}

const tool_used: ConditionTypeMeta<"tool_used"> = {
  label: "Tool used",
  description: "A specific tool was called during the conversation.",
  create: () => ({ type: "tool_used", toolName: "" }),
  summarize: (c) => `Tool "${c.toolName}" was used`,
  Editor: ({ condition, onChange, projectId }) => (
    <ToolNameField
      projectId={projectId}
      label="Tool name"
      placeholder="Search tools…"
      value={condition.toolName}
      onChange={(toolName) => onChange({ ...condition, toolName })}
    />
  ),
}

const tool_failed: ConditionTypeMeta<"tool_failed"> = {
  label: "Tool failed",
  description: "A tool call ended with an error span status (leave name empty for any tool).",
  create: () => ({ type: "tool_failed" }),
  summarize: (c) => (c.toolName ? `Tool "${c.toolName}" failed` : "A tool failed"),
  Editor: ({ condition, onChange, projectId }) => (
    <ToolNameField
      projectId={projectId}
      label="Tool name (optional)"
      placeholder="Any tool"
      value={condition.toolName ?? ""}
      onChange={(toolName) => onChange(toolName ? { ...condition, toolName } : { type: "tool_failed" })}
    />
  ),
}

const tool_call_count: ConditionTypeMeta<"tool_call_count"> = {
  label: "Tool call count",
  description: "Compare how many tool calls happened.",
  create: () => ({ type: "tool_call_count", operator: "gt", value: 0 }),
  summarize: (c) => `Tool calls ${COMPARISON_SYMBOL[c.operator]} ${c.value}`,
  Editor: ({ condition, onChange }) => (
    <div className="flex flex-col gap-3">
      <ComparisonRow
        operator={condition.operator}
        value={condition.value}
        onOperatorChange={(operator) => onChange({ ...condition, operator })}
        onValueChange={(value) => onChange({ ...condition, value })}
      />
    </div>
  ),
}

const error: ConditionTypeMeta<"error"> = {
  label: "Error",
  description: "The trace/session ended in an error state.",
  create: () => ({ type: "error" }),
  summarize: () => "An error occurred",
  Editor: () => null,
}

const finish_reason: ConditionTypeMeta<"finish_reason"> = {
  label: "Finish reason",
  description: "The model's finish reason (e.g. stop, length, tool_calls).",
  create: () => ({ type: "finish_reason", value: "" }),
  summarize: (c) => `Finish reason is "${c.value}"`,
  Editor: ({ condition, onChange }) => (
    <SuggestiveCombobox
      label="Finish reason"
      placeholder="e.g. stop, length, tool_calls"
      value={condition.value}
      onChange={(value) => onChange({ ...condition, value })}
      suggestions={FINISH_REASON_SUGGESTIONS}
    />
  ),
}

function SemanticSimilarityEditor({ condition, onChange }: EditorProps<"semantic_similarity">) {
  const preset = presetForThreshold(condition.threshold)
  const [advanced, setAdvanced] = useState(preset === "custom")
  const presetOptions =
    preset === "custom"
      ? [...SEMANTIC_PRESET_OPTIONS, { label: "Custom", value: "custom" as const }]
      : SEMANTIC_PRESET_OPTIONS

  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Query"
        placeholder="e.g. frustration"
        value={condition.query}
        onChange={(event) => onChange({ ...condition, query: event.target.value })}
      />
      <Select
        name="semantic-similarity-preset"
        label="Sensitivity"
        options={[...presetOptions]}
        value={preset}
        onChange={(value) => {
          if (value === "custom") return
          onChange({ ...condition, threshold: SEMANTIC_SIMILARITY_PRESETS[value] })
        }}
      />
      <SwitchInput label="Advanced" checked={advanced} onCheckedChange={setAdvanced} />
      {advanced ? (
        <div className="flex flex-col gap-3">
          <Select
            name="semantic-similarity-operator"
            label="Operator"
            options={[...COMPARISON_OPTIONS]}
            value={condition.operator}
            onChange={(operator) => onChange({ ...condition, operator })}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Text.H6 color="foregroundMuted">Threshold</Text.H6>
              <Text.H5M>{condition.threshold.toFixed(2)}</Text.H5M>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[condition.threshold]}
              onValueChange={(values) => onChange({ ...condition, threshold: values[0] ?? 0 })}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

const semantic_similarity: ConditionTypeMeta<"semantic_similarity"> = {
  label: "Semantic similarity",
  description: "Match when a message is semantically close to a query (uses existing embeddings).",
  create: () => ({
    type: "semantic_similarity",
    query: "",
    operator: "gte",
    threshold: SEMANTIC_SIMILARITY_PRESETS.balanced,
  }),
  summarize: (c) => {
    const preset = presetForThreshold(c.threshold)
    const sensitivity =
      preset === "custom"
        ? `${COMPARISON_SYMBOL[c.operator]} ${c.threshold}`
        : (SEMANTIC_PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? preset)
    return `Similar to "${c.query}" (${sensitivity})`
  },
  Editor: SemanticSimilarityEditor,
}

export const CONDITION_META: { readonly [K in ConditionType]: ConditionTypeMeta<K> } = {
  text_match,
  empty_output,
  output_length,
  json_output,
  metric,
  tool_used,
  tool_failed,
  tool_call_count,
  error,
  finish_reason,
  semantic_similarity,
}

export const CONDITION_TYPE_ORDER: readonly ConditionType[] = [
  "text_match",
  "semantic_similarity",
  "empty_output",
  "output_length",
  "json_output",
  "metric",
  "tool_used",
  "tool_failed",
  "tool_call_count",
  "error",
  "finish_reason",
]

export const summarizeCondition = (condition: EvaluationRuleCondition): string =>
  (CONDITION_META[condition.type] as ConditionTypeMeta).summarize(condition)

/**
 * Whether a condition is complete enough to add — gates the "Add condition" button so users
 * can't create an empty/invalid condition that would only fail at save time.
 */
export const isConditionValid = (c: EvaluationRuleCondition): boolean => {
  switch (c.type) {
    case "text_match":
      return c.value.trim().length > 0 && regexError(c.operator, c.value) === undefined
    case "output_length":
    case "tool_call_count":
    case "metric":
      return Number.isFinite(c.value) && c.value >= 0
    case "tool_used":
      return c.toolName.trim().length > 0
    case "finish_reason":
      return c.value.trim().length > 0
    case "semantic_similarity":
      return c.query.trim().length > 0 && c.threshold >= 0 && c.threshold <= 1
    case "empty_output":
    case "json_output":
    case "tool_failed":
    case "error":
      return true
  }
}
