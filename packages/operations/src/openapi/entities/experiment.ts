import {
  EXPERIMENT_METRICS,
  type Experiment,
  type ExperimentComparison,
  METRIC_ENTITIES,
  type MetricDirection,
  type MetricEntity,
  type MetricUnit,
} from "@domain/experiments"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { FilterSetSchema } from "../schemas.ts"

const VariantTimeRangeSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("relative").describe("A live window ending now, spanning the last `seconds`."),
        seconds: z
          .number()
          .int()
          .positive()
          .describe("Length of the live window in seconds (e.g. 2592000 for the last 30 days)."),
      })
      .openapi("RelativeVariantTimeRange"),
    z
      .object({
        type: z.literal("absolute").describe("A fixed window between two instants."),
        fromIso: z.string().describe("ISO-8601 start of the window (inclusive)."),
        toIso: z.string().describe("ISO-8601 end of the window (inclusive)."),
      })
      .openapi("AbsoluteVariantTimeRange"),
  ])
  .openapi("VariantTimeRange")

const experimentVariantFields = {
  id: cuidSchema.describe("Stable variant identifier, unique within the experiment."),
  name: z.string().describe('Human-readable variant name (e.g. "Variant A"). Unique within the experiment.'),
  baseline: z
    .boolean()
    .describe("`true` for the single baseline variant that every other variant is compared against."),
  filterSet: FilterSetSchema.describe("Session filters selecting this variant's population."),
  query: z.string().nullable().describe("Free-text / semantic search applied to the population, or `null`."),
  timeRange: VariantTimeRangeSchema.nullable().describe(
    "Time window the variant is measured over. `null` uses the default last-30-days window.",
  ),
} as const

const ExperimentVariantSchema = z.object(experimentVariantFields).openapi("ExperimentVariant")

const experimentFields = {
  id: cuidSchema.describe("Stable experiment identifier."),
  organizationId: cuidSchema.describe("Organization that owns this experiment."),
  projectId: cuidSchema.describe("Project this experiment belongs to."),
  slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
  name: z.string().describe("Human-readable name."),
  description: z.string().describe("Free-form description. Empty string when not set."),
  variants: z
    .array(ExperimentVariantSchema)
    .describe("Ordered variants. Exactly one carries the baseline flag when the list is non-empty."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
} as const

export const ExperimentSchema = z.object(experimentFields).openapi("Experiment")

export const ExperimentListItemSchema = z
  .object({
    ...experimentFields,
    variantCount: z.number().int().describe("Number of variants in the experiment."),
    sessionsDistinct: z
      .number()
      .int()
      .describe(
        "Distinct sessions across the union of every variant's population (a session in several variants counts once).",
      ),
    usersDistinct: z
      .number()
      .int()
      .describe(
        "Distinct users across the union of every variant's population (a user in several variants counts once).",
      ),
  })
  .openapi("ExperimentListItem")

const ResolvedRangeSchema = z
  .object({
    fromIso: z.string().describe("ISO-8601 start of the resolved window."),
    toIso: z.string().describe("ISO-8601 end of the resolved window."),
  })
  .openapi("ResolvedRange")

const TopListItemSchema = z
  .object({
    key: z.string().describe("Stable identity: tool name, signal id, or cluster id."),
    label: z.string().describe("Human-readable label (resolved name; falls back to `key` when unresolved)."),
    value: z.number().describe("Ranking value: tool calls / signal occurrences / behaviour observations."),
  })
  .openapi("ExperimentTopListItem")

/** Human-readable unit of a metric's value, so an agent knows what the number means. */
const METRIC_UNIT_LABEL: Record<MetricUnit, string> = {
  count: "count",
  percent: "fraction (0–1)",
  seconds: "seconds",
  dollars: "USD",
  tokens: "tokens",
  score: "score (0–1)",
  days: "days",
}

/** Which delta direction is "good", appended to a metric's description so an agent can read a change. */
const METRIC_DIRECTION_HINT: Record<MetricDirection, string> = {
  "up-good": "; higher is better",
  "down-good": "; lower is better",
  neutral: "",
}

/** Self-describing text for one metric: its explanation, unit, and which delta direction is good. */
const metricDescription = (metric: (typeof EXPERIMENT_METRICS)[number]): string =>
  `${metric.description} — ${METRIC_UNIT_LABEL[metric.unit]}${METRIC_DIRECTION_HINT[metric.direction]}.`

/** A metric's field name within its entity object — the part after `<entity>.`. */
const metricField = (key: string): string => key.slice(key.indexOf(".") + 1)

const entityComponent = (entity: MetricEntity): string =>
  `Experiment${entity.charAt(0).toUpperCase()}${entity.slice(1)}Metrics`

/** Entities that rank a top-N list alongside their metrics, keyed to that list's description. */
const ENTITY_TOP_LIST = {
  tools: "Top tools by call count.",
  signals: "Top signals by occurrence count.",
  behaviours: "Top behaviours by observation count.",
} as const satisfies Partial<Record<MetricEntity, string>>

const MetricDeltaSchema = z
  .union([z.number(), z.literal("up-from-zero")])
  .nullable()
  .describe(
    'Change vs the baseline: a signed fraction `(value - baseline) / baseline`, `"up-from-zero"` for an unbounded increase from a zero baseline, or `null` when incomparable or on the baseline variant itself.',
  )
  .openapi("MetricDelta")

/** Reused leaf for a metric's value; the enclosing per-metric object carries the name/unit/direction. */
const metricValueField = z
  .number()
  .nullable()
  .describe("Value in the metric's unit; `null` when empty or not computable.")

/**
 * One metric as an inline `{ value, delta }` pair, described (name/unit/direction) at the object level.
 * Inline rather than a shared `.openapi()` component on purpose: zod-to-openapi lets the first `$ref`
 * define the component, which would swallow the first metric's field description onto the component.
 */
const metricSchema = (metric: (typeof EXPERIMENT_METRICS)[number]) =>
  z.object({ value: metricValueField, delta: MetricDeltaSchema }).describe(metricDescription(metric))

/**
 * Group the metric catalog into one object per entity (`sessions`/`users`/`tools`/`signals`/
 * `behaviours`). Every metric is a `{ value, delta }` pair described with its UI name, unit, and
 * which delta direction is good; `tools`/`signals`/`behaviours` also carry a `top` ranked list. Built
 * from `EXPERIMENT_METRICS`, so the public schema (and thus the SDK/MCP/CLI) stays exhaustive and in
 * sync with the catalog by construction: adding a metric there surfaces it here with no edits.
 */
const VariantMetricsSchema = z
  .object(
    Object.fromEntries(
      METRIC_ENTITIES.map((entity) => {
        const fields: Record<string, z.ZodTypeAny> = Object.fromEntries(
          EXPERIMENT_METRICS.filter((metric) => metric.entity === entity).map((metric) => [
            metricField(metric.key),
            metricSchema(metric),
          ]),
        )
        const topDescription = ENTITY_TOP_LIST[entity as keyof typeof ENTITY_TOP_LIST]
        if (topDescription) fields.top = z.array(TopListItemSchema).describe(topDescription)
        return [entity, z.object(fields).openapi(entityComponent(entity))]
      }),
    ),
  )
  .describe(
    "Population-scoped metrics grouped by entity. Each metric is a `{ value, delta }` pair; `delta` is the change vs the baseline (`null` on the baseline itself). `tools`, `signals`, and `behaviours` also carry a `top` ranked list.",
  )
  .openapi("VariantMetrics")

const VariantComparisonSchema = z
  .object({
    variantId: z.string().describe("Id of the variant these metrics belong to."),
    baseline: z.boolean().describe("`true` when this is the baseline variant; every metric's `delta` is `null`."),
    approximate: z
      .boolean()
      .describe(
        "`true` when the variant's query has a semantic component, making its population a best-effort sample.",
      ),
    resolvedRange: ResolvedRangeSchema.describe("The absolute window the metrics were computed over."),
    metrics: VariantMetricsSchema,
    deviatingPopulationKeys: z
      .array(z.string())
      .describe(
        "Population keys (a subset of `sessions.count` / `sessions.users`) that deviate from the baseline by more than 25%.",
      ),
  })
  .openapi("VariantComparison")

export const ExperimentComparisonSchema = z
  .object({
    experiment: ExperimentSchema.describe("The experiment, including its variant definitions."),
    variants: z
      .array(VariantComparisonSchema)
      .describe(
        "One entry per variant, in the experiment's stored variant order. The baseline is the entry whose `baseline` field is `true` — identify it by that flag, never by array position.",
      ),
  })
  .openapi("ExperimentComparison")

const toVariantResponse = (variant: Experiment["variants"][number]) => ({
  id: variant.id,
  name: variant.name,
  baseline: variant.baseline,
  filterSet: variant.filterSet as z.infer<typeof FilterSetSchema>,
  query: variant.query,
  timeRange: variant.timeRange as z.infer<typeof VariantTimeRangeSchema> | null,
})

export const toExperimentResponse = (experiment: Experiment) => ({
  id: experiment.id as string,
  organizationId: experiment.organizationId as string,
  projectId: experiment.projectId as string,
  slug: experiment.slug,
  name: experiment.name,
  description: experiment.description,
  variants: experiment.variants.map(toVariantResponse),
  createdAt: experiment.createdAt.toISOString(),
  updatedAt: experiment.updatedAt.toISOString(),
})

const toTopItem = (item: { key: string; label: string; value: number }) => ({
  key: item.key,
  label: item.label,
  value: item.value,
})

/**
 * Merge the reader's flat metric values with their baseline deltas into `{ value, delta }` pairs
 * grouped per entity, folding each ranking entity's `top` list into its section.
 */
const toMetricsResponse = (
  metrics: ExperimentComparison["variants"][number]["metrics"],
  deltas: ExperimentComparison["variants"][number]["deltas"],
) => {
  const nested: Record<string, Record<string, unknown>> = {}
  const groupFor = (entity: string) => {
    const group = nested[entity] ?? {}
    nested[entity] = group
    return group
  }
  for (const metric of EXPERIMENT_METRICS) {
    groupFor(metric.entity)[metricField(metric.key)] = {
      value: metrics.values[metric.key] ?? null,
      delta: deltas[metric.key] ?? null,
    }
  }
  groupFor("tools").top = metrics.topTools.map(toTopItem)
  groupFor("signals").top = metrics.topSignals.map(toTopItem)
  groupFor("behaviours").top = metrics.topBehaviours.map(toTopItem)
  return nested
}

export const toExperimentComparisonResponse = (comparison: ExperimentComparison) => ({
  experiment: toExperimentResponse(comparison.experiment),
  variants: comparison.variants.map((variant) => ({
    variantId: variant.variantId,
    baseline: variant.baseline,
    approximate: variant.approximate,
    resolvedRange: { fromIso: variant.resolvedRange.fromIso, toIso: variant.resolvedRange.toIso },
    metrics: toMetricsResponse(variant.metrics, variant.deltas),
    deviatingPopulationKeys: [...variant.deviatingPopulationKeys] as string[],
  })),
})

export const encodeExperimentCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

export const decodeExperimentCursor = (raw: string): { offset: number } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown
    const offset = (parsed as { offset?: unknown }).offset
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) return null
    return { offset }
  } catch {
    return null
  }
}
