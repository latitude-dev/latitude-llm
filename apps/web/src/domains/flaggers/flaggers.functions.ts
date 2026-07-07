import {
  configureProjectFlaggersForOnboardingUseCase,
  FLAGGER_DEFAULT_SAMPLING,
  FLAGGER_STRATEGY_SLUGS,
  FlaggerRepository,
  type FlaggerSlug,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  updateFlaggerUseCase,
} from "@domain/flaggers"
import { ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { FlaggerRepositoryLive, OutboxEventWriterLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"
import { requireScopedSession, resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

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

// A registered strategy a project has no stored row for yet: shown disabled in
// settings without writing to the DB. The placeholder id is the slug; the real
// row (with a real id) replaces it on the next read once the user enables it.
const toMissingFlaggerRecord = (slug: FlaggerSlug, organizationId: string, projectId: string): FlaggerRecord => {
  const strategy = getFlaggerStrategy(slug)
  const details = strategy && isLlmCapableStrategy(strategy) ? strategy.annotator : strategy?.details
  const epoch = new Date(0).toISOString()

  return {
    id: slug,
    organizationId,
    projectId,
    slug,
    name: details?.name ?? humanizeSlug(slug),
    description: details?.description ?? "Flags matching trace behavior for review.",
    instructions:
      strategy && isLlmCapableStrategy(strategy)
        ? strategy.annotator.instructions
        : "Runs deterministically from telemetry data and does not call an LLM.",
    enabled: false,
    sampling: FLAGGER_DEFAULT_SAMPLING,
    mode: strategy && isLlmCapableStrategy(strategy) ? "llm" : "deterministic",
    suppressedBy: strategy?.suppressedBy ?? [],
    createdAt: epoch,
    updatedAt: epoch,
  }
}

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
  .handler(async ({ data, context }): Promise<readonly FlaggerRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FlaggerRepository
        return yield* repo.listByProject({ projectId })
      }).pipe(withScopedPostgres(FlaggerRepositoryLive, client, orgId), withTracing),
    )

    const storedBySlug = new Map(stored.map((flagger) => [flagger.slug, flagger]))
    return FLAGGER_STRATEGY_SLUGS.map((slug) => {
      const row = storedBySlug.get(slug)
      return row ? toFlaggerRecord(row) : toMissingFlaggerRecord(slug, orgId, data.projectId)
    })
  })

export const configureProjectFlaggersForOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      projectId: z.string(),
      enabledSlugs: z.array(z.enum(FLAGGER_STRATEGY_SLUGS)),
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const { userId, organizationId: orgId } = await requireScopedSession(context)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    await Effect.runPromise(
      configureProjectFlaggersForOnboardingUseCase({
        organizationId: orgId,
        projectId,
        enabledSlugs: data.enabledSlugs,
        actorUserId: userId,
      }).pipe(
        withScopedPostgres(Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive), client, orgId),
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
  .handler(async ({ data, context }): Promise<FlaggerRecord | null> => {
    const { userId, organizationId: orgId } = await requireScopedSession(context)
    const projectId = ProjectId(data.projectId)
    const client = getPostgresClient()

    const flagger = await Effect.runPromise(
      updateFlaggerUseCase({
        organizationId: orgId,
        projectId,
        slug: data.slug,
        enabled: data.enabled,
        sampling: data.sampling,
        actorUserId: userId,
      }).pipe(
        withScopedPostgres(Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive), client, orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return flagger ? toFlaggerRecord(flagger) : null
  })
