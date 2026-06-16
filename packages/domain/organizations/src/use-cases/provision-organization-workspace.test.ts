import { ApiKeyRepository, DEFAULT_API_KEY_NAME, SANDBOX_API_KEY_TOKEN_PREFIX } from "@domain/api-keys"
import { createFakeApiKeyRepository } from "@domain/api-keys/testing"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Project, ProjectRepository } from "@domain/projects"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { provisionOrganizationWorkspaceUseCase } from "./provision-organization-workspace.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")

describe("provisionOrganizationWorkspaceUseCase", () => {
  it("creates the organization outbox event, default api key, and default project inside one transaction", async () => {
    let transactionCalls = 0
    let inTransaction = false
    const writtenEvents: OutboxWriteEvent[] = []
    const { repository: apiKeyRepo, apiKeys: savedApiKeys } = createFakeApiKeyRepository()
    const savedProjects: Project[] = []

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
      provisionOrganizationWorkspaceUseCase({
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
        Effect.provideService(ProjectRepository, {
          findById: () => Effect.die(new Error("unused")),
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
    expect(writtenEvents).toHaveLength(4)
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
      eventName: "SampleProjectCreated",
      organizationId: ORG_ID,
      payload: {
        organizationId: ORG_ID,
        queueAssigneeUserIds: ["user-1"],
      },
    })
    expect(writtenEvents[3]).toMatchObject({
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
    expect(savedProjects).toHaveLength(2)
    expect(savedProjects[0]).toMatchObject({ name: "My project", slug: "my-project", organizationId: ORG_ID })
    expect(savedProjects[1]).toMatchObject({
      name: "Sample project",
      slug: "sample-project",
      organizationId: ORG_ID,
      settings: { isSample: true },
    })
    expect(result.defaultApiKey).toMatchObject({ name: DEFAULT_API_KEY_NAME })
    expect(result.defaultProject).toMatchObject({ name: "My project", slug: "my-project" })
    expect(result.sampleProject).toMatchObject({ name: "Sample project", slug: "sample-project" })
  })
})
