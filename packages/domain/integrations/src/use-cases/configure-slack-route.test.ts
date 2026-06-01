import { generateId, OrganizationId, SlackIntegrationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"
import { InMemorySlackIntegrationRepositoryLive } from "../testing/in-memory-slack-integration-repository.ts"
import { configureSlackRouteUseCase, SlackRouteValidationError } from "./configure-slack-route.ts"
import { removeSlackRouteUseCase } from "./remove-slack-route.ts"

const ORG = OrganizationId("o".repeat(24))

const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called — the in-memory fake should not need it")
  },
} as unknown as SqlClientShape)

const seedIntegration = (id: SlackIntegrationId, overrides: Partial<SlackIntegration> = {}): SlackIntegration => {
  const now = new Date()
  return {
    id,
    organizationId: ORG,
    teamId: "T01",
    teamName: "Acme",
    appId: "A01",
    botUserId: "U01",
    botAccessToken: "xoxb",
    botTokenScopes: "chat:write",
    refreshToken: null,
    tokenExpiresAt: null,
    reconnectRequiredAt: null,
    installedByUserId: UserId("u".repeat(24)),
    installedAt: now,
    revokedAt: null,
    routes: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("configureSlackRouteUseCase", () => {
  it("writes a fresh route list for a group", async () => {
    const integrationId = SlackIntegrationId(generateId())
    const layer = InMemorySlackIntegrationRepositoryLive({
      organizationId: ORG,
      seed: [seedIntegration(integrationId)],
    })

    await Effect.runPromise(
      configureSlackRouteUseCase({
        integrationId,
        group: "incidents",
        routes: [{ channelId: "C111", channelName: "ops" }],
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )

    expect(updated?.routes.incidents).toEqual([{ channelId: "C111", channelName: "ops" }])
  })

  it("rejects duplicate channels in the same group", async () => {
    const integrationId = SlackIntegrationId(generateId())
    const layer = InMemorySlackIntegrationRepositoryLive({
      organizationId: ORG,
      seed: [seedIntegration(integrationId)],
    })

    const result = await Effect.runPromiseExit(
      configureSlackRouteUseCase({
        integrationId,
        group: "incidents",
        routes: [
          { channelId: "C111", channelName: "ops" },
          { channelId: "C111", channelName: "ops-also" },
        ],
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (!Exit.isFailure(result)) return
    const failReason = result.cause.reasons.find(Cause.isFailReason)
    expect(failReason?.error).toBeInstanceOf(SlackRouteValidationError)
  })

  it("fails when the integration is not active in this org", async () => {
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG })

    const result = await Effect.runPromiseExit(
      configureSlackRouteUseCase({
        integrationId: SlackIntegrationId(generateId()),
        group: "incidents",
        routes: [{ channelId: "C111", channelName: "ops" }],
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )

    expect(result._tag).toBe("Failure")
  })
})

describe("removeSlackRouteUseCase", () => {
  it("clears a group's routes", async () => {
    const integrationId = SlackIntegrationId(generateId())
    const layer = InMemorySlackIntegrationRepositoryLive({
      organizationId: ORG,
      seed: [seedIntegration(integrationId, { routes: { incidents: [{ channelId: "C1", channelName: "ops" }] } })],
    })

    await Effect.runPromise(
      removeSlackRouteUseCase({ integrationId, group: "incidents" }).pipe(
        Effect.provide(layer),
        Effect.provide(NoopSqlClient),
      ),
    )

    const updated = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )

    expect(updated?.routes.incidents).toEqual([])
  })
})
