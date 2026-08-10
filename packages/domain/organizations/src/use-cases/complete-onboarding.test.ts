import { ApiKeyRepository, DEFAULT_API_KEY_NAME, SANDBOX_API_KEY_TOKEN_PREFIX } from "@domain/api-keys"
import { createFakeApiKeyRepository } from "@domain/api-keys/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Project, ProjectRepository } from "@domain/projects"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationRepository } from "../testing/index.ts"
import { completeOnboardingUseCase } from "./complete-onboarding.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")

describe("completeOnboardingUseCase", () => {
  it("creates the organization outbox event, default api key, and default project inside one transaction", async () => {
    let transactionCalls = 0
    let inTransaction = false
    const writtenEvents: OutboxWriteEvent[] = []
    const { repository: apiKeyRepo, apiKeys: savedApiKeys } = createFakeApiKeyRepository()
    const savedProjects: Project[] = []
    const { repository: organizationRepo, organizations: savedOrganizations } = createFakeOrganizationRepository()
    savedOrganizations.set(ORG_ID, {
      id: ORG_ID,
      name: "Acme",
      slug: "acme",
      logo: null,
      metadata: null,
      settings: null,
      parentOrgId: null,
      expiresAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })

    const sqlClient: SqlClientShape = {
      organizationId: ORG_ID,
      transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        inTransaction
          ? effect
          : Effect.gen(function* () {
              transactionCalls += 1
              inTransaction = true
              try {
                return yield* effect
              } finally {
                inTransaction = false
              }
            }),
      query: () => Effect.die(new Error("unexpected query")),
    }

    const result = await Effect.runPromise(
      completeOnboardingUseCase({
        organizationId: ORG_ID,
        actorUserId: "user-1",
        name: "Acme",
        slug: "acme",
        defaultProjectName: "My project",
      }).pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(OutboxEventWriter, {
          write: (event: OutboxWriteEvent) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
        Effect.provideService(ApiKeyRepository, apiKeyRepo),
        Effect.provideService(OrganizationRepository, organizationRepo),
        Effect.provideService(ProjectRepository, {
          findById: () => Effect.die(new Error("unused")),
          findByIdForUpdate: () => Effect.die(new Error("unused")),
          findBySlug: () => Effect.die(new Error("unused")),
          list: () => Effect.succeed(savedProjects),
          listIncludingDeleted: () => Effect.succeed(savedProjects),
          save: (project: Project) =>
            Effect.sync(() => {
              savedProjects.push(project)
            }),
          softDelete: () => Effect.die(new Error("unused")),
          hardDelete: () => Effect.die(new Error("unused")),
          existsByName: () => Effect.succeed(false),
          countBySlug: () => Effect.succeed(0),
        }),
      ),
    )

    expect(transactionCalls).toBe(1)
    // No SampleProjectCreated event: provisioning no longer seeds a per-org demo
    // (Phase 3 cutover, task C1). Only ApiKeyCreated, ProjectCreated, OrganizationCreated.
    expect(writtenEvents).toHaveLength(3)
    expect(writtenEvents[0]).toMatchObject({
      eventName: "ApiKeyCreated",
      organizationId: ORG_ID,
      payload: {
        organizationId: ORG_ID,
        actorUserId: "user-1",
        name: DEFAULT_API_KEY_NAME,
      },
    })
    expect(writtenEvents[1]).toMatchObject({
      eventName: "ProjectCreated",
      organizationId: ORG_ID,
      payload: {
        organizationId: ORG_ID,
        actorUserId: "user-1",
        name: "My project",
        slug: "my-project",
      },
    })
    expect(writtenEvents[2]).toMatchObject({
      eventName: "OrganizationCreated",
      aggregateId: ORG_ID,
      organizationId: ORG_ID,
      payload: {
        organizationId: ORG_ID,
        actorUserId: "user-1",
        name: "Acme",
        slug: "acme",
      },
    })
    const apiKeys = [...savedApiKeys.values()]
    expect(apiKeys).toHaveLength(1)
    expect(apiKeys[0]?.name).toBe(DEFAULT_API_KEY_NAME)
    expect(apiKeys[0]?.token.startsWith(SANDBOX_API_KEY_TOKEN_PREFIX)).toBe(false)
    // Only the real default project — no seeded "Sample project" anymore.
    expect(savedProjects).toHaveLength(1)
    expect(savedProjects[0]).toMatchObject({ name: "My project", slug: "my-project", organizationId: ORG_ID })
    expect(savedProjects.some((project) => project.settings?.isSample === true)).toBe(false)
    expect(savedOrganizations.get(ORG_ID)).toMatchObject({ id: ORG_ID, settings: { wantsShowcase: true } })
    expect(result.defaultApiKey).toMatchObject({ name: DEFAULT_API_KEY_NAME })
    expect(result.defaultProject).toMatchObject({ name: "My project", slug: "my-project" })
    expect(result).not.toHaveProperty("sampleProject")
  })
})
