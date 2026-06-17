import { OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import type { Signal } from "@domain/signals"
import { createSignalCentroid, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestSignalAssignedNotificationsUseCase } from "./request-issue-assigned-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("i"))
const assigneeId = cuid("u1")
const actorUserId = cuid("u2")
const assignedAt = "2026-05-07T10:00:00.000Z"

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId: orgId as string,
  projectId: projectId as string,
  slug: "assigned-issue",
  name: "Assigned issue",
  description: "Repeatable failure",
  source: "annotation",
  assigneeId,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-05-01T00:00:00Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  ...overrides,
})

const makeLayer = (issues: readonly Signal[] = [makeSignal()]) => {
  const { repository: signalRepository } = createFakeSignalRepository(issues)
  return Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
}

describe("requestSignalAssignedNotificationsUseCase", () => {
  it("produces exactly one request targeting the new assignee", async () => {
    const result = await Effect.runPromise(
      requestSignalAssignedNotificationsUseCase({
        organizationId: orgId,
        signalId,
        assigneeId,
        actorUserId,
        assignedAt,
      }).pipe(Effect.provide(makeLayer())),
    )

    expect(result.status).toBe("ok")

    if (result.status !== "ok") throw new Error("unreachable")

    expect(result.requests).toHaveLength(1)
    const request = result.requests[0]
    expect(request.userId).toBe(assigneeId)
    expect(request.kind).toBe("issue.assigned")
    expect(request.idempotencyKey).toBe(`issue.assigned:${signalId}:${assignedAt}`)
    expect(request.projectId).toBe(projectId)
    expect(request.payload).toEqual({ signalId, actorUserId, assignedAt })
  })

  it("skips self-assignments", async () => {
    const result = await Effect.runPromise(
      requestSignalAssignedNotificationsUseCase({
        organizationId: orgId,
        signalId,
        assigneeId: actorUserId,
        actorUserId,
        assignedAt,
      }).pipe(Effect.provide(makeLayer())),
    )

    expect(result).toEqual({ status: "skipped", reason: "self-assignment" })
  })

  it("skips when the issue no longer exists", async () => {
    const result = await Effect.runPromise(
      requestSignalAssignedNotificationsUseCase({
        organizationId: orgId,
        signalId,
        assigneeId,
        actorUserId,
        assignedAt,
      }).pipe(Effect.provide(makeLayer([]))),
    )

    expect(result).toEqual({ status: "skipped", reason: "issue-not-found" })
  })

  it("keys idempotency per assignment event: redelivery replays the key, re-assignment mints a new one", async () => {
    const run = (at: string) =>
      Effect.runPromise(
        requestSignalAssignedNotificationsUseCase({
          organizationId: orgId,
          signalId,
          assigneeId,
          actorUserId,
          assignedAt: at,
        }).pipe(Effect.provide(makeLayer())),
      )

    const first = await run(assignedAt)
    const redelivered = await run(assignedAt)
    const reassigned = await run("2026-05-08T09:00:00.000Z")

    if (first.status !== "ok" || redelivered.status !== "ok" || reassigned.status !== "ok") {
      throw new Error("expected ok results")
    }
    expect(redelivered.requests[0]?.idempotencyKey).toBe(first.requests[0]?.idempotencyKey)
    expect(redelivered.requests[0]?.payload).toEqual(first.requests[0]?.payload)
    expect(reassigned.requests[0]?.idempotencyKey).not.toBe(first.requests[0]?.idempotencyKey)
  })
})
