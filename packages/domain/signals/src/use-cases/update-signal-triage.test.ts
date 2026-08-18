import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { updateSignalTriageUseCase } from "./update-signal-triage.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"
const actorUserId = "aaaaaaaaaaaaaaaaaaaaaaaa"
const teammateId = "tttttttttttttttttttttttt"
const now = new Date("2026-07-01T12:00:00.000Z")

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "assistant-leaks-prompts",
  name: "Assistant leaks internal prompts",
  description: "The assistant reveals its system prompt when asked indirectly.",
  source: "annotation",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  promotedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  ...overrides,
})

const run = (input: {
  readonly signal: Signal
  readonly assigneeId?: string | null
  readonly priority?: Signal["priority"]
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository([input.signal])
  const { repository: membershipRepository } = createFakeMembershipRepository({ isMember: () => Effect.succeed(true) })
  const events: OutboxWriteEvent[] = []
  const writer = OutboxEventWriter.of({
    write: (event) => Effect.sync(() => void events.push(event)),
  })

  const effect = updateSignalTriageUseCase({
    projectId,
    signalId,
    actorUserId,
    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    now,
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(SignalRepository, signalRepository),
        Layer.succeed(MembershipRepository, membershipRepository),
        Layer.succeed(OutboxEventWriter, writer),
      ),
    ),
    Effect.provideService(SqlClient, createPassthroughSqlClient()),
  )

  return { effect, events, issues }
}

const priorityEvents = (events: readonly OutboxWriteEvent[]) =>
  events.filter((event) => event.eventName === "SignalReprioritized")

describe("updateSignalTriageUseCase", () => {
  it("emits SignalReprioritized carrying both sides of an increase", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: "medium" }), priority: "urgent" })

    await Effect.runPromise(effect)

    expect(priorityEvents(events)).toEqual([
      expect.objectContaining({
        eventName: "SignalReprioritized",
        aggregateId: signalId,
        organizationId,
        payload: {
          organizationId,
          projectId,
          signalId,
          priority: "urgent",
          previousPriority: "medium",
          actorUserId,
          reprioritizedAt: now.toISOString(),
        },
      }),
    ])
  })

  it("treats a first priority as an increase — unset ranks below low", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: null }), priority: "low" })

    await Effect.runPromise(effect)

    expect(priorityEvents(events)[0]?.payload).toMatchObject({ priority: "low", previousPriority: null })
  })

  it("writes nothing to the outbox for a downgrade", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: "urgent" }), priority: "low" })

    await Effect.runPromise(effect)

    expect(events).toEqual([])
  })

  it("writes nothing to the outbox for a clear — no priority is the lowest rank", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: "high" }), priority: null })

    await Effect.runPromise(effect)

    expect(events).toEqual([])
  })

  it("stays silent when the priority is unchanged", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: "high" }), priority: "high" })

    await Effect.runPromise(effect)

    expect(priorityEvents(events)).toEqual([])
  })

  it("still saves the row on a downgrade — only the announcement is suppressed", async () => {
    const { effect, events, issues } = run({ signal: makeSignal({ priority: "urgent" }), priority: "low" })

    const result = await Effect.runPromise(effect)

    expect(result.changed).toBe(true)
    expect(result.priority).toBe("low")
    expect(issues.get(signalId)?.priority).toBe("low")
    expect(events).toEqual([])
  })

  it("stays silent on an assignee-only edit", async () => {
    const { effect, events } = run({ signal: makeSignal({ priority: "high" }), assigneeId: teammateId })

    await Effect.runPromise(effect)

    expect(priorityEvents(events)).toEqual([])
    expect(events.map((event) => event.eventName)).toEqual(["SignalAssigneeChanged"])
  })

  it("emits both events when one edit changes assignee and raises priority", async () => {
    const { effect, events } = run({ signal: makeSignal(), assigneeId: teammateId, priority: "low" })

    await Effect.runPromise(effect)

    expect(events.map((event) => event.eventName)).toEqual(["SignalAssigneeChanged", "SignalReprioritized"])
  })
})
