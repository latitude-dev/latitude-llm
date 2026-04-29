import {
  FLAGGER_STRATEGY_SLUGS,
  FlaggerRepository,
  type FlaggerSlug,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  updateFlaggerUseCase,
} from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { FlaggerRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"

const humanizeSlug = (slug: string) => slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

const toFlaggerRecord = (flagger: {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly slug: FlaggerSlug
  readonly enabled: boolean
  readonly sampling: number
  readonly createdAt: Date
  readonly updatedAt: Date
}) => {
  const strategy = getFlaggerStrategy(flagger.slug)
  const details = strategy && isLlmCapableStrategy(strategy) ? strategy.annotator : strategy?.details

  return {
    id: flagger.id,
    organizationId: flagger.organizationId,
    projectId: flagger.projectId,
    slug: flagger.slug,
    name: details?.name ?? humanizeSlug(flagger.slug),
    description: details?.description ?? "Flags matching trace behavior for review.",
    instructions:
      strategy && isLlmCapableStrategy(strategy)
        ? strategy.annotator.instructions
        : "Runs deterministically from telemetry data and does not call an LLM.",
    enabled: flagger.enabled,
    sampling: flagger.sampling,
    mode: strategy && isLlmCapableStrategy(strategy) ? "llm" : "deterministic",
    suppressedBy: strategy?.suppressedBy ?? [],
    createdAt: flagger.createdAt.toISOString(),
    updatedAt: flagger.updatedAt.toISOString(),
  }
}

export type FlaggerRecord = ReturnType<typeof toFlaggerRecord>

export const listFlaggersByProject = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly FlaggerRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flaggers = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FlaggerRepository
        return yield* repo.listByProject({ projectId })
      }).pipe(withPostgres(FlaggerRepositoryLive, client, orgId), withTracing),
    )

    return flaggers.map(toFlaggerRecord)
  })

export const updateFlagger = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      slug: z.enum(FLAGGER_STRATEGY_SLUGS),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ data }): Promise<FlaggerRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flagger = await Effect.runPromise(
      updateFlaggerUseCase({ organizationId, projectId, slug: data.slug, enabled: data.enabled }).pipe(
        withPostgres(FlaggerRepositoryLive, client, orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return flagger ? toFlaggerRecord(flagger) : null
  })
