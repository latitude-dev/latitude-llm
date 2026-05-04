import { type ApiKey, ApiKeyRepository, DEFAULT_API_KEY_NAME } from "@domain/api-keys"
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
    const savedApiKeys: ApiKey[] = []
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
        Effect.provideService(ApiKeyRepository, {
          findById: () => Effect.die(new Error("unused")),
          list: () => Effect.succeed(savedApiKeys),
          save: (apiKey: ApiKey) =>
            Effect.sync(() => {
              savedApiKeys.push(apiKey)
            }),
          delete: () => Effect.die(new Error("unused")),
          touch: () => Effect.die(new Error("unused")),
          findByTokenHash: () => Effect.die(new Error("unused")),
          touchBatch: () => Effect.die(new Error("unused")),
        }),
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
          existsBySlug: () => Effect.succeed(false),
        }),
      ),
    )

    expect(transactionCalls).toBe(1)
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
    expect(savedApiKeys).toHaveLength(1)
    expect(savedApiKeys[0]?.name).toBe(DEFAULT_API_KEY_NAME)
    expect(savedProjects).toHaveLength(1)
    expect(savedProjects[0]).toMatchObject({ name: "My project", slug: "my-project", organizationId: ORG_ID })
    expect(result.defaultApiKey).toMatchObject({ name: DEFAULT_API_KEY_NAME })
    expect(result.defaultProject).toMatchObject({ name: "My project", slug: "my-project" })
  })
})
