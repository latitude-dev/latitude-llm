import { OrganizationId, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { updateSignalUseCase } from "./update-signal.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeUserSignal = (): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "slow-checkout",
  name: "Slow checkout",
  description: "Checkout responses take too long",
  source: "custom",
  origin: "user",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

describe("updateSignalUseCase", () => {
  it("updates name, description, and filters; keeps the slug stable", async () => {
    const { repository, issues } = createFakeSignalRepository([makeUserSignal()])

    const result = await Effect.runPromise(
      updateSignalUseCase({
        projectId,
        signalId: SignalId(signalId),
        name: "Checkout latency",
        description: "Checkout is slow",
        filters: { "tags.service": [{ op: "in", value: ["checkout"] }] },
      }).pipe(
        Effect.provide(Layer.succeed(SignalRepository, repository)),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.changed).toBe(true)
    const signal = issues.get(signalId)
    expect(signal?.name).toBe("Checkout latency")
    expect(signal?.description).toBe("Checkout is slow")
    expect(signal?.filters).not.toBeNull()
    expect(signal?.slug).toBe("slow-checkout")
  })

  it("is a no-op when no fields are provided", async () => {
    const { repository, issues } = createFakeSignalRepository([makeUserSignal()])

    const result = await Effect.runPromise(
      updateSignalUseCase({ projectId, signalId: SignalId(signalId) }).pipe(
        Effect.provide(Layer.succeed(SignalRepository, repository)),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.changed).toBe(false)
    expect(issues.get(signalId)?.name).toBe("Slow checkout")
  })
})
