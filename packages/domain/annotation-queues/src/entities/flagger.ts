import { cuidSchema, flaggerIdSchema } from "@domain/shared"
import { z } from "zod"
import { FLAGGER_STRATEGY_SLUGS } from "../flagger-strategies/types.ts"

// ---------------------------------------------------------------------------
// Flagger entity
// ---------------------------------------------------------------------------

/**
 * Per-project configuration for a single flagger strategy.
 *
 * One row per `(project, strategy slug)` is provisioned at project creation.
 * The row gates whether the flagger runs at all (`enabled`) and, for
 * LLM-capable strategies, the sampling percentage applied on `no-match`
 * before the strategy is escalated to the LLM workflow.
 *
 * Flagger-authored scores carry `source = "flagger"` and `sourceId = <flagger.id>`.
 */
export const flaggerSchema = z.object({
  id: flaggerIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  /** Strategy slug from the registry (e.g. `"jailbreaking"`, `"nsfw"`, `"tool-call-errors"`). */
  slug: z.enum(FLAGGER_STRATEGY_SLUGS),
  /** Gates BOTH the deterministic match path AND the LLM enqueue path. */
  enabled: z.boolean(),
  /**
   * Percentage in `[0, 100]`. Only consulted by LLM-capable strategies on `no-match`
   * (deterministic-only strategies ignore this field).
   */
  sampling: z.number().int().min(0).max(100),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Flagger = z.infer<typeof flaggerSchema>

/** Default `enabled` value applied to a flagger row at provisioning time. */
export const FLAGGER_DEFAULT_ENABLED = true
