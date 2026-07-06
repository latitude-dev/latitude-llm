import { type OrganizationId, organizationIdSchema, type ProjectId, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * The showcase pointer is a global singleton row keyed on `id = 1`, so the
 * table structurally enforces "one current / one next". This constant is that
 * key — used by the create use-case and the DB `CHECK (id = 1)` guard.
 */
export const SHOWCASE_SINGLETON_ID = 1

/**
 * Redis key holding the resolved live showcase (`{ organizationId, projectId }`)
 * so steady-state resolution is O(1) with the pointer table as source of truth.
 * The cache client auto-prefixes `latitude:`, so on the wire this is
 * `latitude:showcase:current`. The swap invalidates it after flipping.
 */
export const SHOWCASE_CURRENT_CACHE_KEY = "showcase:current"

/**
 * `next_state` is only meaningful while `nextProjectId` is set: `building`
 * (seed running) → `ready` (built + gated, swap may proceed). Idle is simply
 * `nextProjectId === null`. Failure is not a state (loud error + reclaim).
 */
export const showcaseNextStateSchema = z.enum(["building", "ready"])
export type ShowcaseNextState = z.infer<typeof showcaseNextStateSchema>

export const showcaseSchema = z.object({
  id: z.literal(SHOWCASE_SINGLETON_ID),
  organizationId: organizationIdSchema,
  currentProjectId: projectIdSchema.nullable(),
  nextProjectId: projectIdSchema.nullable(),
  nextState: showcaseNextStateSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Showcase = z.infer<typeof showcaseSchema>

export const createShowcase = (params: {
  readonly organizationId: OrganizationId
  readonly currentProjectId?: ProjectId | null
  readonly nextProjectId?: ProjectId | null
  readonly nextState?: ShowcaseNextState | null
  readonly createdAt?: Date
  readonly updatedAt?: Date
}): Showcase => {
  const now = new Date()
  return showcaseSchema.parse({
    id: SHOWCASE_SINGLETON_ID,
    organizationId: params.organizationId,
    currentProjectId: params.currentProjectId ?? null,
    nextProjectId: params.nextProjectId ?? null,
    nextState: params.nextState ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
}
