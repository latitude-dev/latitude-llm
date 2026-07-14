import { cuidSchema, experimentIdSchema, filterSetSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  EXPERIMENT_NAME_MAX_LENGTH,
  MAX_VARIANTS_PER_EXPERIMENT,
  VARIANT_NAME_MAX_LENGTH,
  VARIANT_QUERY_MAX_LENGTH,
} from "../constants.ts"

/**
 * A variant's time window. `relative` stays "live" — it resolves to `[now - seconds, now]`
 * on every read, so the experiment keeps tracking the trailing window. `absolute` is fixed.
 * `null` (unset) resolves to the default window (last 30 days). See `resolveVariantRange`.
 */
export const variantTimeRangeSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("relative"), seconds: z.number().int().positive() }),
    z.object({ type: z.literal("absolute"), fromIso: z.iso.datetime(), toIso: z.iso.datetime() }),
  ])
  .nullable()
export type VariantTimeRange = z.infer<typeof variantTimeRangeSchema>

/**
 * The "super-entity" grouping the three things that select a population: a `filterSet`
 * (sessions filter mode), a free-text/semantic `query`, and a `timeRange`. Embedded in the
 * experiment's `variants` array (no child table). Exactly one variant carries `baseline: true`.
 */
export const experimentVariantSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(VARIANT_NAME_MAX_LENGTH),
  baseline: z.boolean(),
  filterSet: filterSetSchema,
  query: z.string().max(VARIANT_QUERY_MAX_LENGTH).nullable(),
  timeRange: variantTimeRangeSchema,
})
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>

/**
 * A project-scoped container comparing 2+ variants against one baseline. Mirrors the
 * monitor entity (org RLS, slug per project, soft delete) but owns an embedded, ordered
 * `variants` array instead of a target + rule, and computes comparison analytics on read.
 *
 * Structural invariants (enforced here, so they also hold when parsing stored rows on read):
 * variant ids are unique, and exactly one variant is `baseline` when `variants` is non-empty.
 * Variant-name uniqueness is a write-time rule enforced in the create/update use-cases, not here —
 * legacy rows may hold duplicate names and must still parse on read.
 */
export const experimentSchema = z
  .object({
    id: experimentIdSchema,
    organizationId: organizationIdSchema,
    projectId: projectIdSchema,
    slug: z.string().min(1).max(128),
    name: z.string().min(1).max(EXPERIMENT_NAME_MAX_LENGTH),
    description: z.string(),
    variants: z.array(experimentVariantSchema).max(MAX_VARIANTS_PER_EXPERIMENT),
    deletedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((experiment, ctx) => {
    const ids = new Set<string>()
    for (const variant of experiment.variants) {
      if (ids.has(variant.id)) {
        ctx.addIssue({ code: "custom", path: ["variants"], message: `Duplicate variant id "${variant.id}"` })
      }
      ids.add(variant.id)
    }
    const baselineCount = experiment.variants.filter((variant) => variant.baseline).length
    if (experiment.variants.length === 0) {
      if (baselineCount !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["variants"],
          message: "An experiment with no variants cannot have a baseline",
        })
      }
    } else if (baselineCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: `Exactly one variant must be the baseline (found ${baselineCount})`,
      })
    }
  })
export type Experiment = z.infer<typeof experimentSchema>

/** The baseline variant of an experiment, or `null` when it has no variants. */
export const baselineVariant = (experiment: Pick<Experiment, "variants">): ExperimentVariant | null =>
  experiment.variants.find((variant) => variant.baseline) ?? null
