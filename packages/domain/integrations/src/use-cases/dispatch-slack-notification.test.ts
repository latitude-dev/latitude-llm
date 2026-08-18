import { type Organization, OrganizationRepository } from "@domain/organizations"
import { SavedSearchRepository } from "@domain/saved-searches"
import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  SignalId,
  SlackIntegrationId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { UserRepository } from "@domain/users"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { InMemorySlackDeliveryRepositoryLive } from "../testing/in-memory-slack-delivery-repository.ts"
import { dispatchSlackNotificationUseCase, type SlackMessenger } from "./dispatch-slack-notification.ts"

// custom.message doesn't call SignalRepository, but the use case's R
// channel includes it. Provide a no-op stub so Effect.provide is happy.
const NoopSignalRepository = Layer.succeed(SignalRepository, {
  findById: () => Effect.die(new Error("SignalRepository.findById not expected in this test")),
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

// Same rationale as NoopSignalRepository: custom.message never resolves an assignee name.
const NoopUserRepository = Layer.succeed(UserRepository, {
  findById: () => Effect.die(new Error("UserRepository.findById not expected in this test")),
} as never)

// Same rationale as NoopSignalRepository: custom.message never resolves a source name.
const NoopSavedSearchRepository = Layer.succeed(SavedSearchRepository, {
  findById: () => Effect.die(new Error("SavedSearchRepository.findById not expected in this test")),
} as never)

const ORG = OrganizationId("o".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const INTEGRATION = SlackIntegrationId("i".repeat(24))
const SIGNAL = SignalId("s".repeat(24))

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
              expiresAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } satisfies Organization)
          : Effect.fail(new NotFoundError({ entity: "Organization", id })),
      findByIdForUpdate: (id) =>
        id === ORG
          ? Effect.succeed({
              id: ORG,
              name: "Acme",
              slug: "acme",
              logo: null,
              metadata: null,
              settings: null,
              parentOrgId,
              expiresAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } satisfies Organization)
          : Effect.fail(new NotFoundError({ entity: "Organization", id })),
      listByUserId: () => Effect.die("not used"),
      save: () => Effect.die("not used"),
      delete: () => Effect.die("not used"),
      deleteIfExpiredUnclaimed: () => Effect.die("not used"),
      countBySlug: () => Effect.die("not used"),
      listExpiredUnclaimed: () => Effect.die("not used"),
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

const makeSignal = (): Signal => {
  const now = new Date("2026-06-17T10:00:00.000Z")
  return {
    id: SIGNAL,
    organizationId: ORG,
    projectId: PROJECT,
    slug: "bad-json-output",
    name: "Bad JSON output",
    description: "The model returns malformed JSON.",
    source: "annotation",
    origin: "system",
    assigneeId: null,
    priority: null,
    centroid: {
      base: [1, 0],
      mass: 1,
      model: "test",
      decay: 1,
      weights: { annotation: 1, custom: 0, evaluation: 0 },
    },
    clusteredAt: now,
    promotedAt: now,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    feedback: null,
    createdAt: now,
    updatedAt: now,
  }
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
        Effect.provide(NoopSignalRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(outcome.status).toBe("delivered")
    expect(messenger.calls).toHaveLength(1)
  })

  it("renders discovered signal details with a deep link", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive()
    const { repository } = createFakeSignalRepository([makeSignal()])

    const outcome = await Effect.runPromise(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "signal.discovered",
        payload: { signalId: SIGNAL, discoveredAt: "2026-06-17T10:00:00.000Z" },
        idempotencyKey: `signal.discovered:${SIGNAL}`,
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(Layer.succeed(SignalRepository, repository)),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(outcome.status).toBe("delivered")
    expect(messenger.calls).toHaveLength(1)
    expect(messenger.calls[0]).toMatchObject({
      text: "Bad JSON output was discovered in Frontend.",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          text: expect.objectContaining({
            text: "A new signal was discovered: *<https://app.example.com/projects/frontend/signals/bad-json-output|Bad JSON output>*.",
          }),
        }),
        expect.objectContaining({
          text: expect.objectContaining({ text: "The model returns malformed JSON." }),
        }),
        expect.objectContaining({
          elements: expect.arrayContaining([expect.objectContaining({ text: "signal · Project *Frontend* · Acme" })]),
        }),
        expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({
              url: "https://app.example.com/projects/frontend/signals/bad-json-output",
            }),
          ]),
        }),
      ]),
    })
  })

  it("renders a priority change as a labelled transition", async () => {
    const messenger = fakeMessenger()
    const layer = InMemorySlackDeliveryRepositoryLive()
    const { repository } = createFakeSignalRepository([makeSignal()])

    const outcome = await Effect.runPromise(
      dispatchSlackNotificationUseCase({
        integrationId: INTEGRATION,
        botToken: "xoxb-test",
        channelId: "C123",
        kind: "signal.reprioritized",
        payload: {
          signalId: SIGNAL,
          actorUserId: "uuuuuuuuuuuuuuuuuuuuuuuu",
          reprioritizedAt: "2026-06-17T10:00:00.000Z",
          priority: "urgent",
          previousPriority: "medium",
          severity: "urgent",
        },
        idempotencyKey: `signal.reprioritized:${SIGNAL}:2026-06-17T10:00:00.000Z`,
        context: ctx,
        messenger,
      }).pipe(
        Effect.provide(layer),
        Effect.provide(Layer.succeed(SignalRepository, repository)),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(outcome.status).toBe("delivered")
    expect(messenger.calls[0]).toMatchObject({
      text: "Priority raised on Bad JSON output in Frontend.",
      blocks: expect.arrayContaining([
        expect.objectContaining({
          text: expect.objectContaining({
            text: "Priority raised on *<https://app.example.com/projects/frontend/signals/bad-json-output|Bad JSON output>*: \u{1F7E1} Medium → \u{1F534} Urgent.",
          }),
        }),
      ]),
    })
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
        Effect.provide(NoopSignalRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
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
        Effect.provide(NoopSignalRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
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
        Effect.provide(NoopSignalRepository),
        Effect.provide(NoopSavedSearchRepository),
        Effect.provide(NoopUserRepository),
        Effect.provide(NoopSqlClient),
        Effect.provide(LiveOrg),
      ),
    )

    expect(result._tag).toBe("Failure")
    expect(messenger.calls).toHaveLength(0)
  })
})
