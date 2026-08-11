import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, ProjectId, ScoreId, SignalId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestSignalRegressedNotificationsUseCase } from "./request-signal-regressed-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const triggerScoreId = ScoreId(cuid("t"))
const regressedAt = "2026-07-01T10:00:00.000Z"

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
    centroid: null,
    clusteredAt: null,
    promotedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: new Date(regressedAt),
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
  regressedAt,
  triggerScoreId,
}

describe("requestSignalRegressedNotificationsUseCase", () => {
  it("fans out to org members with a per-cycle idempotency key", async () => {
    const result = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(Effect.provide(makeLayer({ signal: makeSignal() }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests).toHaveLength(2)
    const first = result.requests[0]
    if (!first) throw new Error("expected a request")
    expect(first.kind).toBe("signal.regressed")
    expect(first.idempotencyKey).toBe(`signal.regressed:${signalId}:${triggerScoreId}`)
    expect(first.payload).toEqual({ signalId, regressedAt, triggerScoreId })
    expect(first.slackEligible).toBe(true)
  })

  it("notifies only the assignee when one is set", async () => {
    const assigneeId = cuid("u9")
    const result = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ assigneeId }) })),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests.map((request) => request.userId)).toEqual([UserId(assigneeId)])
    expect(result.requests[0]?.slackEligible).toBe(false)
  })

  it("skips muted signals — mute is the notification barrier", async () => {
    const result = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ mutedAt: new Date("2026-06-20T00:00:00Z") }) })),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "muted" })
  })

  it("skips when the signal is gone or belongs to another project", async () => {
    const missing = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(Effect.provide(makeLayer({ signal: null }))),
    )
    expect(missing).toEqual({ status: "skipped", reason: "signal-not-found" })

    const foreign = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal({ projectId: ProjectId(cuid("x")) }) })),
      ),
    )
    expect(foreign).toEqual({ status: "skipped", reason: "signal-not-found" })
  })

  it("skips when there is nobody to notify", async () => {
    const result = await Effect.runPromise(
      requestSignalRegressedNotificationsUseCase(input).pipe(
        Effect.provide(makeLayer({ signal: makeSignal(), members: [] })),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "no-recipients" })
  })
})
