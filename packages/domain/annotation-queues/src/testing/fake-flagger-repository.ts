import { FlaggerId, generateId } from "@domain/shared"
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

    provisionForProject: ({ organizationId, projectId, slugs }) =>
      Effect.sync(() => {
        const now = new Date()
        for (const slug of slugs) {
          const key = keyFor(projectId, slug)
          if (indexByProjectSlug.has(key)) continue

          const id = FlaggerId(generateId())
          const flagger: Flagger = {
            id,
            organizationId,
            projectId,
            slug,
            enabled: FLAGGER_DEFAULT_ENABLED,
            sampling: FLAGGER_DEFAULT_SAMPLING,
            createdAt: now,
            updatedAt: now,
          }
          flaggers.set(id, flagger)
          indexByProjectSlug.set(key, id)
        }

        return [...flaggers.values()]
          .filter((f) => f.projectId === projectId && slugs.includes(f.slug))
          .sort((a, b) => a.slug.localeCompare(b.slug))
      }),

    ...overrides,
  }

  return { repository, flaggers }
}
