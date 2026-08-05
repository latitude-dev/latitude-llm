import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, ProjectId, SignalId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestSignalDiscoveredNotificationsUseCase } from "./request-signal-discovered-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const discoveredAt = "2026-06-17T10:00:00.000Z"

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
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const makeLayer = (opts: { signal?: Signal | null; members?: readonly Membership[] } = {}) => {
  const { repository: membershipRepository } = createFakeMembershipRepository({
    listByOrganizationId: () => Effect.succeed([...(opts.members ?? [member("u1"), member("u2")])]),
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
  discoveredAt,
}

describe("requestSignalDiscoveredNotificationsUseCase", () => {
  it("fans out one discovery request per org member when unassigned", async () => {
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(Effect.provide(makeLayer({ signal: makeSignal() }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")

    expect(result.requests).toHaveLength(2)
    const first = result.requests[0]
    if (!first) throw new Error("expected a request")
    expect(first.kind).toBe("signal.discovered")
    expect(first.projectId).toBe(projectId)
    expect(first.slackEligible).toBe(true)
    expect(first.idempotencyKey).toBe(`signal.discovered:${signalId}`)
    expect(first.payload).toEqual({ signalId, discoveredAt })
  })

  // The signal's level rides along as `severity`, which is the key the Slack
  // route threshold and `emailMinSeverity` filter on. Adding it does not move
  // the idempotency key, which is derived from the signal id alone.
  it("carries the signal's level as the payload severity", async () => {
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ priority: "urgent" }) })),
      ),
    )

    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests[0]?.payload).toEqual({ signalId, discoveredAt, severity: "urgent" })
    expect(result.requests[0]?.idempotencyKey).toBe(`signal.discovered:${signalId}`)
  })

  it("omits severity entirely for a signal with no level", async () => {
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(Effect.provide(makeLayer({ signal: makeSignal() }))),
    )

    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests[0]?.payload).not.toHaveProperty("severity")
  })

  it("sends discovery requests only to the assignee when assigned", async () => {
    const assigneeId = UserId(cuid("u2"))
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ assigneeId }) })),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]?.userId).toBe(assigneeId)
    expect(result.requests[0]?.slackEligible).toBe(false)
  })

  it("skips when the signal is missing", async () => {
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(Effect.provide(makeLayer())),
    )

    expect(result).toEqual({ status: "skipped", reason: "signal-not-found" })
  })

  it("skips user-origin signals", async () => {
    const result = await Effect.runPromise(
      requestSignalDiscoveredNotificationsUseCase(input).pipe(
        Effect.provide(
          makeLayer({ signal: makeSignal({ origin: "user", source: "custom", centroid: null, clusteredAt: null }) }),
        ),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "user-origin-signal" })
  })
})
