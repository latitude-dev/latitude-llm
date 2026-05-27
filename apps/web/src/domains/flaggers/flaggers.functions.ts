import {
  configureProjectFlaggersForOnboardingUseCase,
  FLAGGER_STRATEGY_SLUGS,
  FlaggerRepository,
  type FlaggerSlug,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  updateFlaggerUseCase,
} from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { FlaggerRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
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

const toAvailableFlaggerRecord = (slug: FlaggerSlug) => {
  const strategy = getFlaggerStrategy(slug)
  const details = strategy && isLlmCapableStrategy(strategy) ? strategy.annotator : strategy?.details

  return {
    slug,
    name: details?.name ?? humanizeSlug(slug),
    description: details?.description ?? "Flags matching trace behavior for review.",
    mode: strategy && isLlmCapableStrategy(strategy) ? "llm" : "deterministic",
  }
}

type AvailableFlaggerRecord = ReturnType<typeof toAvailableFlaggerRecord>

export const listAvailableFlaggers = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly AvailableFlaggerRecord[]> => {
    await requireSession()
    return FLAGGER_STRATEGY_SLUGS.map(toAvailableFlaggerRecord)
  },
)

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

export const configureProjectFlaggersForOnboarding = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      enabledSlugs: z.array(z.enum(FLAGGER_STRATEGY_SLUGS)),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    await Effect.runPromise(
      configureProjectFlaggersForOnboardingUseCase({
        organizationId,
        projectId,
        enabledSlugs: data.enabledSlugs,
        actorUserId: userId,
      }).pipe(
        withPostgres(Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive), client, orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
  })

export const updateFlagger = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      slug: z.enum(FLAGGER_STRATEGY_SLUGS),
      enabled: z.boolean(),
      sampling: z.number().int().min(0).max(100),
    }),
  )
  .handler(async ({ data }): Promise<FlaggerRecord | null> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flagger = await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId,
        projectId,
        slug: data.slug,
        enabled: data.enabled,
        sampling: data.sampling,
        actorUserId: userId,
      }).pipe(
        withPostgres(Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive), client, orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return flagger ? toFlaggerRecord(flagger) : null
  })
