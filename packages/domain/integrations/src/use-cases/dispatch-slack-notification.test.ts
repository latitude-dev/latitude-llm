import { IssueRepository } from "@domain/issues"
import { type Organization, OrganizationRepository } from "@domain/organizations"
import { SavedSearchRepository } from "@domain/saved-searches"
import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  SlackIntegrationId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { InMemorySlackDeliveryRepositoryLive } from "../testing/in-memory-slack-delivery-repository.ts"
import { dispatchSlackNotificationUseCase, type SlackMessenger } from "./dispatch-slack-notification.ts"

// custom.message doesn't call IssueRepository, but the use case's R
// channel includes it. Provide a no-op stub so Effect.provide is happy.
const NoopIssueRepository = Layer.succeed(IssueRepository, {
  findById: () => Effect.die(new Error("IssueRepository.findById not expected in this test")),
  findByIdForUpdate: () => Effect.die(new Error("not expected")),
  findByIds: () => Effect.die(new Error("not expected")),
  findBySlug: () => Effect.die(new Error("not expected")),
  list: () => Effect.die(new Error("not expected")),
  save: () => Effect.die(new Error("not expected")),
  softDelete: () => Effect.die(new Error("not expected")),
  hardDelete: () => Effect.die(new Error("not expected")),
  existsByName: () => Effect.die(new Error("not expected")),
  countBySlug: () => Effect.die(new Error("not expected")),
} as never)

// Same rationale as NoopIssueRepository: custom.message never resolves a source name.
const NoopSavedSearchRepository = Layer.succeed(SavedSearchRepository, {
  findById: () => Effect.die(new Error("SavedSearchRepository.findById not expected in this test")),
} as never)

const ORG = OrganizationId("o".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const INTEGRATION = SlackIntegrationId("i".repeat(24))

// Org-repo layer for the test-mode guard the use case now resolves up
// front. `parentOrgId` decides sandbox-ness: null = live, set = sandbox.
const orgRepoLayer = (parentOrgId: OrganizationId | null) =>
  Layer.succeed(
    OrganizationRepository,
    OrganizationRepository.of({
      findById: (id) =>
        id === ORG
          ? Effect.succeed({
              id: ORG,
              name: "Acme",
              slug: "acme",
              logo: null,
              metadata: null,
              settings: null,
              parentOrgId,
              createdAt: new Date(),
              updatedAt: new Date(),
            } satisfies Organization)
          : Effect.fail(new NotFoundError({ entity: "Organization", id })),
      listByUserId: () => Effect.die("not used"),
      save: () => Effect.die("not used"),
      delete: () => Effect.die("not used"),
      countBySlug: () => Effect.die("not used"),
    }),
  )

const LiveOrg = orgRepoLayer(null)

const ctx = {
  webAppUrl: "https://app.example.com",
  organization: { id: ORG, name: "Acme" },
  project: { id: PROJECT, name: "Frontend", slug: "frontend" },
  notificationId: null,
}

const customMessagePayload = {
  title: "Heads up",
  content: "Please reboot",
  link: "https://docs.example.com",
}

const fakeMessenger = (): SlackMessenger & { calls: Array<unknown> } => {
  const calls: Array<unknown> = []
  return {
    calls,
    post: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return { messageTs: "1700000000.000100" }
      }),
  }
}

// SqlClient is required by the use-case but not exercised by the in-memory delivery repo.
const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called — the in-memory fake should not need it")
  },
} as unknown as SqlClientShape)

describe("dispatchSlackNotificationUseCase", () => {
  it("renders, posts, and marks the delivery on a fresh claim", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive()

    const outcome = await Effect.runPromise(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "custom.message",
        payload: customMessagePayload,
        idempotencyKey: "custom.message:abc",
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(NoopIssueRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(outcome.status).toBe("delivered")
    expect(messenger.calls).toHaveLength(1)
  })

  it("short-circuits on second dispatch with the same idempotency + channel", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive({ seedClaimedKeys: ["custom.message:abc::C123"] })

    const outcome = await Effect.runPromise(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "custom.message",
        payload: customMessagePayload,
        idempotencyKey: "custom.message:abc",
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(NoopIssueRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(outcome.status).toBe("skipped-already-delivered")
    expect(messenger.calls).toHaveLength(0)
  })

  it("short-circuits for a sandbox org — no claim, no post", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive()
    const sandboxOrg = orgRepoLayer(OrganizationId("parent".padEnd(24, "0")))

    const outcome = await Effect.runPromise(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "custom.message",
        payload: customMessagePayload,
        idempotencyKey: "custom.message:sandbox",
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(NoopIssueRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(sandboxOrg),
      ),
    )

    expect(outcome.status).toBe("skipped-sandbox")
    expect(messenger.calls).toHaveLength(0)
  })

  it("fails with RenderSlackError when the payload doesn't match the kind schema", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive()

    const result = await Effect.runPromiseExit(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "custom.message",
        payload: { wrong: "shape" },
        idempotencyKey: "custom.message:xyz",
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(NoopIssueRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(result._tag).toBe("Failure")
    expect(messenger.calls).toHaveLength(0)
  })
})
