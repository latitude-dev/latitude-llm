import { ApiKeyCacheInvalidator, ApiKeyRepository, createApiKey } from "@domain/api-keys"
import { createFakeApiKeyRepository } from "@domain/api-keys/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type OAuthKey, OAuthKeyRepository, OAuthTokenCacheInvalidator } from "@domain/oauth-keys"
import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { teardownOrganizationUseCase } from "./teardown-organization.ts"

const ORG_ID = OrganizationId("iapkf6osmlm7mbw9kulosua4")
const ACTOR_USER_ID = "ye9d77pxi50nh1gyqljkffnb"

const OAUTH_KEY: OAuthKey = {
  id: "client-a:user-1",
  clientId: "client-a",
  clientName: null,
  clientIcon: null,
  userId: "user-1",
  userName: null,
  userEmail: "user-1@example.com",
  lastActivityAt: null,
  connectedAt: new Date(0),
  disabled: false,
}

const createHarness = () => {
  const apiKey = createApiKey({ organizationId: ORG_ID, token: "tok", tokenHash: "hash", name: "default" })
  const { repository: apiKeyRepository, apiKeys } = createFakeApiKeyRepository()
  apiKeys.set(apiKey.id, apiKey)

  const project = createProject({ organizationId: ORG_ID, name: "Project", slug: "project" })
  const { repository: projectRepository, rows: projects } = createFakeProjectRepository([project])

  let oauthTokens = ["a1-first", "a1-refreshed"]
  const disabledClientIds = new Set<string>()
  const oauthKeyRepository: (typeof OAuthKeyRepository)["Service"] = {
    listForOrganization: () => Effect.sync(() => (oauthTokens.length > 0 ? [OAUTH_KEY] : [])),
    findByPair: () => Effect.succeed(oauthTokens.length > 0 ? OAUTH_KEY : null),
    applicationBelongsToOrganization: (clientId) => Effect.succeed(clientId === OAUTH_KEY.clientId),
    deleteTokensForPair: () =>
      Effect.sync(() => {
        const removed = oauthTokens
        oauthTokens = []
        return removed
      }),
    hasRemainingTokensForApplication: () => Effect.sync(() => oauthTokens.length > 0),
    markApplicationDisabled: (clientId) =>
      Effect.sync(() => {
        disabledClientIds.add(clientId)
      }),
  }

  const invalidatedApiKeyHashes: string[] = []
  const invalidatedOAuthTokens: string[] = []
  const events: OutboxWriteEvent[] = []

  const layers = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(ApiKeyRepository, apiKeyRepository),
    Layer.succeed(ApiKeyCacheInvalidator, {
      delete: (tokenHash) =>
        Effect.sync(() => {
          invalidatedApiKeyHashes.push(tokenHash)
        }),
    }),
    Layer.succeed(OAuthKeyRepository, oauthKeyRepository),
    Layer.succeed(OAuthTokenCacheInvalidator, {
      invalidate: (accessToken) =>
        Effect.sync(() => {
          invalidatedOAuthTokens.push(accessToken)
        }),
    }),
    Layer.succeed(ProjectRepository, projectRepository),
    Layer.succeed(OutboxEventWriter, {
      write: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  )

  return {
    layers,
    apiKey,
    apiKeys,
    project,
    projects,
    remainingOAuthTokens: () => oauthTokens,
    disabledClientIds,
    invalidatedApiKeyHashes,
    invalidatedOAuthTokens,
    events,
  }
}

describe("teardownOrganizationUseCase", () => {
  it("revokes API keys, revokes OAuth keys, and purges projects of the scoped organization", async () => {
    const harness = createHarness()

    await Effect.runPromise(
      teardownOrganizationUseCase({ actorUserId: ACTOR_USER_ID }).pipe(Effect.provide(harness.layers)),
    )

    expect(harness.apiKeys.get(harness.apiKey.id)?.deletedAt).not.toBeNull()
    expect(harness.invalidatedApiKeyHashes).toEqual(["hash"])

    expect(harness.remainingOAuthTokens()).toEqual([])
    expect(harness.invalidatedOAuthTokens.sort()).toEqual(["a1-first", "a1-refreshed"])
    expect([...harness.disabledClientIds]).toEqual(["client-a"])

    expect(harness.projects.get(harness.project.id)?.deletedAt).not.toBeNull()
    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]).toMatchObject({
      eventName: "ProjectDeleted",
      organizationId: ORG_ID,
      payload: { organizationId: ORG_ID, actorUserId: ACTOR_USER_ID, projectId: harness.project.id },
    })
  })
})
