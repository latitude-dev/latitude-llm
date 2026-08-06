import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { MembershipRepository } from "@domain/organizations"
import { OrganizationId, ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal, SignalPriority } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { updateSignalTriageUseCase } from "./update-signal-triage.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const actorUserId = cuid("u")
const createdAt = new Date("2026-08-01T00:00:00.000Z")

const makeSignal = (priority: SignalPriority | null, priorityFloor: SignalPriority | null = null): Signal => ({
  id: signalId,
  organizationId: orgId,
  projectId,
  slug: "tool-errors",
  name: "Tool errors",
  description: "A tool keeps failing.",
  source: "flagger",
  origin: "system",
  assigneeId: null,
  priority,
  priorityFloor,
  centroid: null,
  clusteredAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  createdAt,
  updatedAt: createdAt,
})

const run = (signal: Signal, priority: SignalPriority | null | undefined) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository([signal])
  const events: OutboxWriteEvent[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    Layer.succeed(MembershipRepository, {} as never),
    Layer.succeed(
      OutboxEventWriter,
      OutboxEventWriter.of({
        write: (event) =>
          Effect.sync(() => {
            events.push(event)
          }),
      }),
    ),
  )

  return Effect.runPromise(
    updateSignalTriageUseCase({
      projectId,
      signalId,
      actorUserId,
      ...(priority === undefined ? {} : { priority }),
    }).pipe(Effect.provide(layer)),
  ).then((result) => ({ result, issues }))
}

describe("updateSignalTriageUseCase", () => {
  // A level somebody chose is an assertion, so the volume recompute can raise it
  // but never pull it back down.
  it("records a hand-set level as the floor", async () => {
    const { result, issues } = await run(makeSignal(null), "high")

    expect(result).toMatchObject({ priority: "high", changed: true })
    expect(issues.get(signalId)?.priorityFloor).toBe("high")
  })

  it("lowers the floor when someone lowers the level", async () => {
    const { issues } = await run(makeSignal("urgent", "urgent"), "low")

    expect(issues.get(signalId)?.priorityFloor).toBe("low")
  })

  // Clearing the priority is how you hand the level back to the volume model.
  it("releases the floor when the level is cleared", async () => {
    const { issues } = await run(makeSignal("high", "high"), null)

    expect(issues.get(signalId)?.priority).toBeNull()
    expect(issues.get(signalId)?.priorityFloor).toBeNull()
  })

  it("leaves the floor alone when the edit does not touch the level", async () => {
    const { issues } = await run(makeSignal("medium", "medium"), undefined)

    expect(issues.get(signalId)?.priorityFloor).toBe("medium")
  })
})
