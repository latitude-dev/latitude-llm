import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, ProjectId, SignalId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestSignalReprioritizedNotificationsUseCase } from "./request-signal-reprioritized-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const actorUserId = cuid("u1")
const reprioritizedAt = "2026-07-01T10:00:00.000Z"

const member = (uid: string): Membership => ({
  id: cuid(`m${uid}`) as Membership["id"],
  organizationId: orgId as Membership["organizationId"],
  userId: UserId(cuid(uid)),
  role: "member" as MembershipRole,
  createdAt: new Date("2026-01-01T00:00:00Z"),
})

const makeSignal = (overrides: Partial<Signal> = {}): Signal => {
  const now = new Date("2026-06-17T10:00:00.000Z")
  return {
    id: signalId,
    organizationId: orgId,
    projectId,
    slug: "bad-json-output",
    name: "Bad JSON output",
    description: "The model returns malformed JSON.",
    source: "annotation",
    origin: "system",
    scoreEvidence: [],
    assigneeId: null,
    priority: "urgent",
    centroid: null,
    clusteredAt: null,
    promotedAt: now,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    feedback: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const makeLayer = (opts: { signal?: Signal | null; members?: readonly Membership[] } = {}) => {
  const { repository: membershipRepository } = createFakeMembershipRepository({
    listByOrganizationId: () => Effect.succeed([...(opts.members ?? [member("u1"), member("u2"), member("u3")])]),
  })
  const { repository: signalRepository } = createFakeSignalRepository(opts.signal ? [opts.signal] : [])

  return Layer.mergeAll(
    Layer.succeed(MembershipRepository, membershipRepository),
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
}

const input = {
  organizationId: orgId,
  projectId,
  signalId,
  priority: "urgent",
  previousPriority: "medium",
  actorUserId,
  reprioritizedAt,
} satisfies Parameters<typeof requestSignalReprioritizedNotificationsUseCase>[0]

const run = (
  overrides: Partial<Parameters<typeof requestSignalReprioritizedNotificationsUseCase>[0]> = {},
  layerOpts: Parameters<typeof makeLayer>[0] = { signal: makeSignal() },
) =>
  Effect.runPromise(
    requestSignalReprioritizedNotificationsUseCase({ ...input, ...overrides }).pipe(
      Effect.provide(makeLayer(layerOpts)),
    ),
  )

describe("requestSignalReprioritizedNotificationsUseCase", () => {
  it("fans out to org members with a per-edit idempotency key", async () => {
    const result = await run()

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests.map((r) => r.userId)).toEqual([UserId(cuid("u2")), UserId(cuid("u3"))])
    for (const request of result.requests) {
      expect(request.kind).toBe("signal.reprioritized")
      expect(request.projectId).toBe(projectId)
      expect(request.idempotencyKey).toBe(`signal.reprioritized:${signalId}:${reprioritizedAt}`)
    }
  })

  it("carries the transition off the event, not the signal's current priority", async () => {
    // The row already moved on to `low`; the notification still announces the
    // edit the event described.
    const result = await run({}, { signal: makeSignal({ priority: "low" }) })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests[0]?.payload).toMatchObject({
      signalId,
      actorUserId,
      reprioritizedAt,
      priority: "urgent",
      previousPriority: "medium",
      severity: "urgent",
    })
  })

  it("treats a first priority as an increase, with the new tier as the filter anchor", async () => {
    const result = await run({ priority: "low", previousPriority: null })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests[0]?.payload).toMatchObject({ priority: "low", previousPriority: null, severity: "low" })
  })

  it("re-checks the increase rule the event already applied", async () => {
    // Downgrade, clear, and no-op never reach the producer in practice — the
    // outbox write is guarded — but the rule's testable home is here.
    for (const edit of [
      { priority: "low", previousPriority: "urgent" },
      { priority: null, previousPriority: "high" },
      { priority: "high", previousPriority: "high" },
      { priority: null, previousPriority: null },
    ] as const) {
      expect(await run(edit, { signal: null })).toEqual({ status: "skipped", reason: "not-an-increase" })
    }
  })

  it("never notifies the teammate who made the edit", async () => {
    const result = await run({}, { signal: makeSignal(), members: [member("u1"), member("u2")] })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests.map((r) => r.userId)).toEqual([UserId(cuid("u2"))])
  })

  it("still hands Slack an occurrence when the actor is the only member", async () => {
    // Slack routes are channel-scoped, not per-recipient: a solo org that
    // opted the topic in still wants the message, even though the only
    // person to notify in-app is the one who made the edit.
    const result = await run({}, { signal: makeSignal(), members: [member("u1")] })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.requests).toEqual([])
    expect(result.slackOccurrence).toMatchObject({
      kind: "signal.reprioritized",
      projectId,
      idempotencyKey: `signal.reprioritized:${signalId}:${reprioritizedAt}`,
      notificationId: null,
      payload: { priority: "urgent", previousPriority: "medium", severity: "urgent" },
    })
  })

  it("points the Slack occurrence at a real in-app row when there is one", async () => {
    const result = await run()

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.slackOccurrence.notificationId).toBe(result.requests[0]?.notificationId)
  })

  it("skips a muted signal", async () => {
    const result = await run({}, { signal: makeSignal({ mutedAt: new Date("2026-06-20T00:00:00Z") }) })

    expect(result).toEqual({ status: "skipped", reason: "muted" })
  })

  it("skips a signal that is gone or belongs to another project", async () => {
    expect(await run({}, { signal: null })).toEqual({ status: "skipped", reason: "signal-not-found" })
    expect(await run({}, { signal: makeSignal({ projectId: ProjectId(cuid("other")) }) })).toEqual({
      status: "skipped",
      reason: "signal-not-found",
    })
  })
})
