import {
  type EvaluationSettings,
  evaluationSettingsSchema,
  type FilterCondition,
  type FilterSet,
  filterSetSchema,
} from "@domain/shared"
import { z } from "zod"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

// Generation-side mirror of `evaluationRuleConditionSchema`, deliberately dumbed down for Bedrock
// structured output: one FLAT object (a union of per-type objects compiles to a grammar Bedrock
// rejects as too large), no `.default()`/`.optional()` (every property present, `.nullable()` for
// the ones a given `type` does not use), and no constraint keywords beyond `minLength`.
// `mapGeneratedSignalDraft` reassembles real conditions and re-parses through the shared schema,
// which enforces per-type required fields and refinements (regex validity, traceCount aggregation).
const generatedRuleConditionSchema = z.object({
  type: z.enum([
    "text_match",
    "empty_output",
    "output_length",
    "json_output",
    "metric",
    "tool_used",
    "tool_failed",
    "tool_call_count",
    "error",
    "finish_reason",
    "semantic_similarity",
  ]),
  scope: z
    .enum(["last_assistant", "any_assistant", "any_user", "any_tool", "conversation"])
    .nullable()
    .describe("text_match only"),
  textOperator: z
    .enum(["contains", "not_contains", "matches_regex", "not_matches_regex"])
    .nullable()
    .describe("text_match only"),
  text: z
    .string()
    .min(1)
    .nullable()
    .describe("text_match: the text or regex; finish_reason: the reason string; semantic_similarity: the query"),
  caseSensitive: z.boolean().nullable().describe("text_match only"),
  unit: z.enum(["chars", "words"]).nullable().describe("output_length only"),
  comparison: z.enum(["gt", "gte", "lt", "lte"]).nullable().describe("output_length, metric, tool_call_count"),
  numberValue: z.number().nullable().describe("output_length, metric, tool_call_count; base units (ns, microcents)"),
  expectation: z.enum(["valid", "invalid"]).nullable().describe("json_output only"),
  metricField: z
    .enum(["duration", "cost", "tokensTotal", "tokensInput", "tokensOutput", "errorCount", "traceCount", "spanCount"])
    .nullable()
    .describe("metric only"),
  aggregation: z.enum(["session", "anyTrace", "allTraces"]).nullable().describe("metric only"),
  toolName: z.string().min(1).nullable().describe("tool_used (required), tool_failed (optional)"),
  threshold: z
    .number()
    .nullable()
    .describe("semantic_similarity only; cosine similarity 0 to 1 (0.4 broad, 0.55 balanced, 0.7 strict)"),
})

type GeneratedRuleCondition = z.infer<typeof generatedRuleConditionSchema>

// Reassembles a shared-schema-shaped condition from the flat generation fields. Fields the type
// does not use are dropped; missing required ones surface as zod issues from the shared re-parse
// (repair-turn feedback). Integer-typed values are rounded here since the generation schema
// cannot carry `.int()` (it emits `minimum`/`maximum`, which Bedrock rejects).
const toSharedCondition = (c: GeneratedRuleCondition): Record<string, unknown> => {
  switch (c.type) {
    case "text_match":
      return {
        type: c.type,
        ...(c.scope === null ? {} : { scope: c.scope }),
        ...(c.textOperator === null ? {} : { operator: c.textOperator }),
        ...(c.text === null ? {} : { value: c.text }),
        ...(c.caseSensitive === null ? {} : { caseSensitive: c.caseSensitive }),
      }
    case "output_length":
      return {
        type: c.type,
        ...(c.unit === null ? {} : { unit: c.unit }),
        ...(c.comparison === null ? {} : { operator: c.comparison }),
        ...(c.numberValue === null ? {} : { value: Math.round(c.numberValue) }),
      }
    case "json_output":
      return { type: c.type, ...(c.expectation === null ? {} : { expectation: c.expectation }) }
    case "metric":
      return {
        type: c.type,
        ...(c.metricField === null ? {} : { field: c.metricField }),
        ...(c.aggregation === null ? {} : { aggregation: c.aggregation }),
        ...(c.comparison === null ? {} : { operator: c.comparison }),
        ...(c.numberValue === null ? {} : { value: c.numberValue }),
      }
    case "tool_used":
    case "tool_failed":
      return { type: c.type, ...(c.toolName === null ? {} : { toolName: c.toolName }) }
    case "tool_call_count":
      return {
        type: c.type,
        ...(c.comparison === null ? {} : { operator: c.comparison }),
        ...(c.numberValue === null ? {} : { value: Math.round(c.numberValue) }),
      }
    case "finish_reason":
      return { type: c.type, ...(c.text === null ? {} : { value: c.text }) }
    case "semantic_similarity":
      return {
        type: c.type,
        ...(c.text === null ? {} : { query: c.text }),
        ...(c.threshold === null ? {} : { threshold: c.threshold }),
      }
    case "empty_output":
    case "error":
      return { type: c.type }
  }
}

// The four multi-select dimensions the builder's scope editor offers, plus metadata key/value
// pairs — exactly what a created signal's filters can round-trip through the UI. Required fields
// with empty-array sentinels, not `.nullable()`: Bedrock caps union-typed parameters at 16 per
// schema, so unions are reserved for the condition object where null carries real meaning.
const generatedFiltersSchema = z.object({
  tags: z.array(z.string().min(1)),
  serviceNames: z.array(z.string().min(1)),
  models: z.array(z.string().min(1)),
  providers: z.array(z.string().min(1)),
  metadata: z
    .array(z.object({ key: z.string().min(1), value: z.string().min(1) }))
    .describe("Only when the user explicitly names a metadata key and value"),
})

export const generatedSignalDraftSchema = z.object({
  reasoning: z.string().min(1).describe("How the draft maps to the ask and which observed project values you matched"),
  // Constraint keywords Bedrock structured output rejects (maxLength, maxItems, maximum) stay out
  // of this schema; `mapGeneratedSignalDraft` clamps or re-validates instead.
  name: z.string().min(1).describe(`At most ${SIGNAL_NAME_MAX_LENGTH} characters, recognizable in a list`),
  description: z
    .string()
    .min(1)
    .describe("One or two sentences a teammate would recognize; record the interpretation you took"),
  evaluationKind: z.enum(["rule", "judge", "script"]).describe("Prefer rule, then judge, then script"),
  ruleMatch: z.enum(["all", "any"]).describe('Used when evaluationKind is rule; "all" otherwise'),
  ruleConditions: z
    .array(generatedRuleConditionSchema)
    .describe("1 to 10 conditions when evaluationKind is rule; [] otherwise"),
  judgeCriteria: z
    .string()
    .describe('When evaluationKind is judge, phrased as "A session matches when …"; "" otherwise'),
  script: z.string().describe('When evaluationKind is script, the raw sandbox script body; "" otherwise'),
  filters: generatedFiltersSchema.describe(
    "All arrays empty unless a filter discards sessions that surely cannot match",
  ),
  sampling: z.number().describe("Whole percentage (1 to 100) of in-scope sessions the evaluation runs on"),
})

export type GeneratedSignalDraft = z.infer<typeof generatedSignalDraftSchema>

export interface MappedSignalDraft {
  readonly name: string
  readonly description: string
  readonly filters: FilterSet | undefined
  readonly sampling: number
  readonly evaluation: { readonly settings: EvaluationSettings } | { readonly script: string }
}

type MapGeneratedSignalDraftResult =
  | { readonly ok: true; readonly draft: MappedSignalDraft }
  | { readonly ok: false; readonly issues: string }

const invalid = (issues: string): MapGeneratedSignalDraftResult => ({ ok: false, issues })

const formatZodIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")

const IN_DIMENSIONS = ["tags", "serviceNames", "models", "providers"] as const

const mapFilters = (
  filters: GeneratedSignalDraft["filters"],
): { readonly ok: true; readonly filters: FilterSet | undefined } | { readonly ok: false; readonly issues: string } => {
  const mapped: Record<string, FilterCondition[]> = {}
  for (const field of IN_DIMENSIONS) {
    const values = filters[field]
    if (values.length > 0) {
      mapped[field] = [{ op: "in", value: values }]
    }
  }
  for (const entry of filters.metadata) {
    mapped[`metadata.${entry.key}`] = [{ op: "eq", value: entry.value }]
  }
  if (Object.keys(mapped).length === 0) return { ok: true, filters: undefined }
  const parsed = filterSetSchema.safeParse(mapped)
  if (!parsed.success) return { ok: false, issues: `filters: ${formatZodIssues(parsed.error)}` }
  return { ok: true, filters: parsed.data }
}

/**
 * Maps a model-emitted draft onto `createSignalUseCase`'s input shape, re-validating the evaluation
 * through the shared `evaluationSettingsSchema` so its refinements apply. A failure returns the
 * issues as text — repair-turn feedback for the model, never an exception.
 */
export const mapGeneratedSignalDraft = (generated: GeneratedSignalDraft): MapGeneratedSignalDraftResult => {
  let evaluation: MappedSignalDraft["evaluation"]
  switch (generated.evaluationKind) {
    case "rule": {
      if (generated.ruleConditions.length === 0) {
        return invalid("evaluationKind is rule but ruleConditions is empty")
      }
      const settings = evaluationSettingsSchema.safeParse({
        kind: "rule",
        match: generated.ruleMatch,
        conditions: generated.ruleConditions.map(toSharedCondition),
      })
      if (!settings.success) return invalid(formatZodIssues(settings.error))
      evaluation = { settings: settings.data }
      break
    }
    case "judge": {
      const criteria = generated.judgeCriteria.trim()
      if (criteria.length === 0) {
        return invalid("evaluationKind is judge but judgeCriteria is empty")
      }
      evaluation = { settings: { kind: "judge", criteria } }
      break
    }
    case "script": {
      const script = generated.script.trim()
      if (script.length === 0) {
        return invalid("evaluationKind is script but script is empty")
      }
      evaluation = { script }
      break
    }
  }

  const filters = mapFilters(generated.filters)
  if (!filters.ok) return invalid(filters.issues)

  const name = generated.name.trim().slice(0, SIGNAL_NAME_MAX_LENGTH).trim()
  const description = generated.description.trim()
  if (name.length === 0) return invalid("name is empty")
  if (description.length === 0) return invalid("description is empty")
  const sampling = Math.min(100, Math.max(1, Math.round(generated.sampling)))

  return {
    ok: true,
    draft: { name, description, filters: filters.filters, sampling, evaluation },
  }
}
