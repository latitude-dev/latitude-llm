import type { Experiment, ExperimentComparison } from "@domain/experiments"
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

const VariantMetricsSchema = z
  .object({
    values: z
      .record(z.string(), z.number().nullable())
      .describe("Metric value per `<entity>.<metric>` catalog key; `null` when empty or not computable.")
      .openapi("VariantMetricValues"),
    topTools: z.array(TopListItemSchema).describe("Top tools by call count."),
    topSignals: z.array(TopListItemSchema).describe("Top signals by occurrence count."),
    topBehaviours: z.array(TopListItemSchema).describe("Top behaviours by observation count."),
  })
  .openapi("VariantMetrics")

const MetricDeltaSchema = z
  .union([z.number(), z.literal("up-from-zero")])
  .nullable()
  .describe(
    'Change vs the baseline: a signed fraction `(value - baseline) / baseline`, `"up-from-zero"` for an unbounded increase from a zero baseline, or `null` when incomparable or on the baseline itself.',
  )
  .openapi("MetricDelta")

const VariantComparisonSchema = z
  .object({
    variantId: z.string().describe("Id of the variant these metrics belong to."),
    baseline: z.boolean().describe("`true` when this is the baseline variant; its deltas are empty."),
    approximate: z
      .boolean()
      .describe(
        "`true` when the variant's query has a semantic component, making its population a best-effort sample.",
      ),
    resolvedRange: ResolvedRangeSchema.describe("The absolute window the metrics were computed over."),
    metrics: VariantMetricsSchema.describe("Population-scoped metric values and top-N lists."),
    deltas: z
      .record(z.string(), MetricDeltaSchema)
      .describe("Per-metric change vs the baseline, keyed by catalog key. Empty for the baseline variant.")
      .openapi("VariantMetricDeltas"),
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
    variants: z.array(VariantComparisonSchema).describe("Per-variant metrics and deltas, baseline first."),
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

export const toExperimentComparisonResponse = (comparison: ExperimentComparison) => ({
  experiment: toExperimentResponse(comparison.experiment),
  variants: comparison.variants.map((variant) => ({
    variantId: variant.variantId,
    baseline: variant.baseline,
    approximate: variant.approximate,
    resolvedRange: { fromIso: variant.resolvedRange.fromIso, toIso: variant.resolvedRange.toIso },
    metrics: {
      values: variant.metrics.values as Record<string, number | null>,
      topTools: variant.metrics.topTools.map((item) => ({ key: item.key, label: item.label, value: item.value })),
      topSignals: variant.metrics.topSignals.map((item) => ({ key: item.key, label: item.label, value: item.value })),
      topBehaviours: variant.metrics.topBehaviours.map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value,
      })),
    },
    deltas: variant.deltas as Record<string, number | "up-from-zero" | null>,
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
