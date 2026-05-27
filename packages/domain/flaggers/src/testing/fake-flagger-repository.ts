import { FlaggerId, generateId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { FLAGGER_DEFAULT_SAMPLING } from "../constants.ts"
import type { Flagger } from "../entities/flagger.ts"
import { FLAGGER_DEFAULT_ENABLED } from "../entities/flagger.ts"
import type { FlaggerRepositoryShape } from "../ports/flagger-repository.ts"

export const createFakeFlaggerRepository = (
  seedOrOverrides?: readonly Flagger[] | Partial<FlaggerRepositoryShape>,
  maybeOverrides?: Partial<FlaggerRepositoryShape>,
) => {
  const seed = Array.isArray(seedOrOverrides) ? seedOrOverrides : []
  const overrides = Array.isArray(seedOrOverrides) ? maybeOverrides : seedOrOverrides

  const flaggers = new Map<string, Flagger>(seed.map((flagger) => [flagger.id, flagger] as const))

  const keyFor = (projectId: string, slug: string) => `${projectId}|${slug}`

  const indexByProjectSlug = new Map<string, string>(
    seed.map((flagger) => [keyFor(flagger.projectId, flagger.slug), flagger.id] as const),
  )

  const repository: FlaggerRepositoryShape = {
    listByProject: ({ projectId }) =>
      Effect.sync(() =>
        [...flaggers.values()].filter((f) => f.projectId === projectId).sort((a, b) => a.slug.localeCompare(b.slug)),
      ),

    findByProjectAndSlug: ({ projectId, slug }) =>
      Effect.sync(() => {
        const id = indexByProjectSlug.get(keyFor(projectId, slug))
        if (!id) return null
        return flaggers.get(id) ?? null
      }),

    saveManyForProject: ({ projectId, slugs }) =>
      Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const now = new Date()
        const inserted: Flagger[] = []
        for (const slug of slugs) {
          const key = keyFor(projectId, slug)
          if (indexByProjectSlug.has(key)) continue

          const id = FlaggerId(generateId())
          const flagger: Flagger = {
            id,
            organizationId: sqlClient.organizationId,
            projectId,
            slug,
            enabled: FLAGGER_DEFAULT_ENABLED,
            sampling: FLAGGER_DEFAULT_SAMPLING,
            createdAt: now,
            updatedAt: now,
          }
          flaggers.set(id, flagger)
          indexByProjectSlug.set(key, id)
          inserted.push(flagger)
        }
        return inserted.sort((a, b) => a.slug.localeCompare(b.slug))
      }),

    updateEnabledForProject: ({ projectId, enabledSlugs, slugs }) =>
      Effect.sync(() => {
        const enabledSet = new Set(enabledSlugs)
        const updatedFlaggers: Flagger[] = []

        for (const slug of slugs) {
          const id = indexByProjectSlug.get(keyFor(projectId, slug))
          if (!id) continue
          const existing = flaggers.get(id)
          if (!existing) continue

          const enabled = enabledSet.has(slug)
          if (existing.enabled === enabled) continue

          const updated = { ...existing, enabled, updatedAt: new Date() }
          flaggers.set(id, updated)
          updatedFlaggers.push(updated)
        }

        return updatedFlaggers.sort((a, b) => a.slug.localeCompare(b.slug))
      }),

    update: ({ projectId, slug, enabled, sampling }) =>
      Effect.sync(() => {
        const id = indexByProjectSlug.get(keyFor(projectId, slug))
        if (!id) return null
        const existing = flaggers.get(id)
        if (!existing) return null
        const updated = {
          ...existing,
          ...(enabled !== undefined ? { enabled } : {}),
          ...(sampling !== undefined ? { sampling } : {}),
          updatedAt: new Date(),
        }
        flaggers.set(id, updated)
        return updated
      }),

    ...overrides,
  }

  return { repository, flaggers }
}
