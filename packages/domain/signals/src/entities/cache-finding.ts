import { cuidSchema, organizationIdSchema, projectIdSchema, signalIdSchema } from "@domain/shared"
import { CACHE_FINDING_FINGERPRINT_MAX_LENGTH, CACHE_SIGNAL_STATES, CACHE_URGENCIES } from "@domain/spans"
import { z } from "zod"

/**
 * The measured cache verdict a signal was opened for — the LAT-811 payload, persisted.
 *
 * Kept as one nested object rather than spread across the row so the same structure
 * reaches the dispatched coding agent, the cache panel, and (later) an API operation
 * without three hand-written mappings that can disagree. Rates are exactly measured;
 * `modeledSavingsMicrocents` is modeled from tokens times registry prices and will not
 * tie to recorded spend.
 */
export const cacheFindingMeasuresSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  state: z.enum(CACHE_SIGNAL_STATES),
  urgency: z.enum(CACHE_URGENCIES).nullable(),
  actualRate: z.number(),
  breakEvenRate: z.number(),
  ceilingRate: z.number(),
  modeledSavingsMicrocents: z.number(),
  calls: z.number().int().nonnegative(),
  spendMicrocents: z.number(),
  cacheLifetimeSeconds: z.number().int().positive(),
})

/**
 * One open cache finding and the signal it opened.
 *
 * `fingerprint` is the dedupe identity — `(provider, model, state)` — and carries a
 * database unique index per project, so a re-evaluation cannot open a second signal for
 * a finding someone has already read. A state change is a different fingerprint and
 * therefore a different signal: `Investigate` becoming `Stop caching` is a different fix.
 *
 * `firstObservedAt` is when the finding first survived the stability gate and
 * `lastObservedAt` when it was last still true, which is what lets a sweep resolve the
 * signals whose finding has cleared.
 */
export const cacheFindingSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  signalId: signalIdSchema,
  fingerprint: z.string().min(1).max(CACHE_FINDING_FINGERPRINT_MAX_LENGTH),
  measures: cacheFindingMeasuresSchema,
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type CacheFinding = z.infer<typeof cacheFindingSchema>
