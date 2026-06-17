import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { SignalId, OrganizationId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/issue.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-issue-repository.ts"
import { updateSignalTriageUseCase } from "./update-issue-triage.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"
const memberUserId = "uuuuuuuuuuuuuuuuuuuuuuuu"
const strangerUserId = "wwwwwwwwwwwwwwwwwwwwwwww"
const actorUserId = "aaaaaaaaaaaaaaaaaaaaaaaa"

const createFakeOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const service = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { events, service }
}

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Triage candidate",
  description: "The assistant fails in a repeatable way.",
  source: "annotation",
  assigneeId: null,
  priority: null,
  centroid: createSignalCentroid(),
  clusteredAt: new Date("2026-03-20T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-03-20T10:00:00.000Z"),
  updatedAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
})

const makeProvider = (input: {
  readonly signalRepository: ReturnType<typeof createFakeSignalRepository>["repository"]
  readonly members?: readonly string[]
  readonly outboxWriter?: ReturnType<typeof createFakeOutboxEventWriter>["service"]
}) => {
  const members = new Set(input.members ?? [])
  const { repository: membershipRepository } = createFakeMembershipRepository({
    isMember: (_orgId, userId) => Effect.succeed(members.has(userId)),
  })

  return Layer.mergeAll(
    Layer.succeed(SignalRepository, input.signalRepository),
    Layer.succeed(MembershipRepository, membershipRepository),
    Layer.succeed(OutboxEventWriter, input.outboxWriter ?? createFakeOutboxEventWriter().service),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
  )
}

describe("updateSignalTriageUseCase", () => {
  it("assigns a member and sets priority", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const issue = makeSignal()
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])

    const result = await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: memberUserId,
        priority: "high",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, members: [memberUserId] }))),
    )

    expect(result.changed).toBe(true)
    expect(result.assigneeId).toBe(memberUserId)
    expect(result.priority).toBe("high")
    expect(issues.get(issue.id)?.assigneeId).toBe(memberUserId)
    expect(issues.get(issue.id)?.priority).toBe("high")
    expect(issues.get(issue.id)?.updatedAt).toEqual(now)
  })

  it("rejects an assignee that is not a member of the organization", async () => {
    const issue = makeSignal()
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])

    await expect(
      Effect.runPromise(
        updateSignalTriageUseCase({
          projectId,
          signalId: issue.id,
          actorUserId,
          assigneeId: strangerUserId,
        }).pipe(Effect.provide(makeProvider({ signalRepository, members: [memberUserId] }))),
      ),
    ).rejects.toMatchObject({ _tag: "BadRequestError" })

    expect(issues.get(issue.id)?.assigneeId).toBeNull()
  })

  it("clears the assignee with an explicit null without a membership check", async () => {
    const now = new Date("2026-04-11T12:00:00.000Z")
    const issue = makeSignal({ assigneeId: memberUserId, priority: "urgent" })
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])

    const result = await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: null,
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, members: [] }))),
    )

    expect(result.changed).toBe(true)
    expect(result.assigneeId).toBeNull()
    // priority left untouched (key omitted)
    expect(issues.get(issue.id)?.priority).toBe("urgent")
  })

  it("leaves omitted fields untouched and is a no-op when nothing changes", async () => {
    const issue = makeSignal({ assigneeId: memberUserId, priority: "low" })
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])

    const result = await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        priority: "low",
      }).pipe(Effect.provide(makeProvider({ signalRepository, members: [memberUserId] }))),
    )

    expect(result.changed).toBe(false)
    expect(issues.get(issue.id)?.assigneeId).toBe(memberUserId)
    expect(issues.get(issue.id)?.priority).toBe("low")
    expect(issues.get(issue.id)?.updatedAt).toEqual(issue.updatedAt)
  })

  it("rejects an issue that does not belong to the requested project", async () => {
    const issue = makeSignal({ projectId: otherProjectId })
    const { repository: signalRepository } = createFakeSignalRepository([issue])

    await expect(
      Effect.runPromise(
        updateSignalTriageUseCase({
          projectId,
          signalId: issue.id,
          actorUserId,
          priority: "high",
        }).pipe(Effect.provide(makeProvider({ signalRepository, members: [memberUserId] }))),
      ),
    ).rejects.toMatchObject({ _tag: "BadRequestError" })
  })

  it("emits SignalAssigneeChanged with the full payload when the assignee changes", async () => {
    const now = new Date("2026-04-12T12:00:00.000Z")
    const issue = makeSignal()
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { events, service: outboxWriter } = createFakeOutboxEventWriter()

    await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: memberUserId,
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, members: [memberUserId], outboxWriter }))),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "SignalAssigneeChanged",
      aggregateType: "issue",
      aggregateId: issue.id,
      organizationId,
      payload: {
        organizationId,
        projectId,
        signalId: issue.id,
        assigneeId: memberUserId,
        previousAssigneeId: null,
        actorUserId,
        assignedAt: now.toISOString(),
      },
    })
  })

  it("emits the event on clears and re-assignments", async () => {
    const issue = makeSignal({ assigneeId: memberUserId })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { events, service: outboxWriter } = createFakeOutboxEventWriter()
    const provider = makeProvider({ signalRepository, members: [memberUserId], outboxWriter })

    await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: null,
      }).pipe(Effect.provide(provider)),
    )
    await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: memberUserId,
      }).pipe(Effect.provide(provider)),
    )

    expect(events.map((event) => (event.payload as { assigneeId: string | null }).assigneeId)).toEqual([
      null,
      memberUserId,
    ])
    expect((events[1]?.payload as { previousAssigneeId: string | null }).previousAssigneeId).toBeNull()
  })

  it("emits no event for priority-only changes or no-ops", async () => {
    const issue = makeSignal({ assigneeId: memberUserId, priority: "low" })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { events, service: outboxWriter } = createFakeOutboxEventWriter()
    const provider = makeProvider({ signalRepository, members: [memberUserId], outboxWriter })

    // Priority-only change: writes the issue but stays silent.
    await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        priority: "urgent",
      }).pipe(Effect.provide(provider)),
    )
    // No-op: same assignee as stored.
    await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId,
        signalId: issue.id,
        actorUserId,
        assigneeId: memberUserId,
      }).pipe(Effect.provide(provider)),
    )

    expect(events).toHaveLength(0)
  })
})
