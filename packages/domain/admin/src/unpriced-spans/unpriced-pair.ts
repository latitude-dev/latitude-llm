import type { UnpricedCause } from "@domain/spans"
import { z } from "zod"
import type { UnpricedTriageEntry } from "./unpriced-triage.ts"

/**
 * Where the work stands on one provider/model pair. Separate from `cause`, which says what the
 * registry thinks right now: a pair can be a standing catalog gap (`missingPricing`) that staff
 * have consciously parked (`wontFix`).
 *
 * - `active` — a real gap nobody has ruled on. The work queue.
 * - `resolved` — nothing to do: the registry prices it now, or a recorded fix is holding.
 * - `regressed` — a recorded fix stopped working; spans are landing unpriced again.
 * - `wontFix` — no catalog entry could fix it, by derived rule or recorded judgement.
 */
export const UNPRICED_PAIR_STATES = ["active", "regressed", "resolved", "wontFix"] as const
export type UnpricedPairState = (typeof UNPRICED_PAIR_STATES)[number]

export const adminUnpricedProjectRefSchema = z.object({
  projectId: z.string(),
  /** Null when the project was hard-deleted after the spans were ingested. */
  projectName: z.string().nullable(),
  projectSlug: z.string().nullable(),
  organizationId: z.string(),
  organizationName: z.string().nullable(),
  organizationSlug: z.string().nullable(),
  spans: z.number(),
  tokens: z.number(),
  lastOccurrenceAt: z.date(),
})
export type AdminUnpricedProjectRef = z.infer<typeof adminUnpricedProjectRefSchema>

/**
 * One row of the backoffice table: a provider/model pair, deduplicated across every organisation
 * and project it appears in, because one catalog entry or alias fixes all of them at once.
 */
export interface AdminUnpricedPair {
  readonly provider: string
  readonly model: string
  readonly spans: number
  readonly tokens: number
  readonly firstSeenAt: Date
  readonly lastOccurrenceAt: Date
  readonly cause: UnpricedCause
  readonly state: UnpricedPairState
  /** The recorded decision, when one exists; `null` for derived states. */
  readonly triage: UnpricedTriageEntry | null
  /** Set when the derived rules — not a recorded decision — put this pair in `wontFix`. */
  readonly unpriceableReason: string | null
  /** Largest token consumer first, so the affected-projects cell leads with the one that matters. */
  readonly projects: readonly AdminUnpricedProjectRef[]
}

/**
 * A recorded decision matching nothing in the window. Without surfacing these the list only ever
 * grows, and a `fixed` entry that has aged out is exactly the one whose tripwire no longer guards
 * anything.
 */
export interface AdminStaleUnpricedTriage {
  readonly entry: UnpricedTriageEntry
}
