import { ProjectId, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { resolveSignalsMentionedInTextUseCase } from "./resolve-signals-mentioned-in-text.ts"

const projectId = ProjectId("p".repeat(24))

const makeSignal = (overrides: Partial<Signal> = {}): Signal =>
  ({
    id: SignalId("s".repeat(24)),
    organizationId: "o".repeat(24),
    projectId,
    slug: "slow-checkout",
    visualId: "LAT-001",
    name: "Slow checkout",
    description: "Checkout is slow",
    source: "custom",
    origin: "user",
    filters: null,
    assigneeId: null,
    priority: null,
    centroid: null,
    clusteredAt: null,
    mutedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  }) as Signal

describe("resolveSignalsMentionedInTextUseCase", () => {
  it("resolves visual ids mentioned in free text for the current project", async () => {
    const { repository } = createFakeSignalRepository([
      makeSignal({ visualId: "LAT-001" }),
      makeSignal({ id: SignalId("t".repeat(24)), visualId: "LAT-002", slug: "other-issue" }),
    ])

    const resolved = await Effect.runPromise(
      resolveSignalsMentionedInTextUseCase({
        projectId,
        text: "Fix LAT-001 and ignore lat-002",
      }).pipe(
        Effect.provideService(SignalRepository, repository),
        Effect.provideService(SqlClient, createFakeSqlClient()),
      ),
    )

    expect(resolved).toEqual([
      {
        visualId: "LAT-001",
        signalId: "s".repeat(24),
        slug: "slow-checkout",
        name: "Slow checkout",
      },
      {
        visualId: "LAT-002",
        signalId: "t".repeat(24),
        slug: "other-issue",
        name: "Slow checkout",
      },
    ])
  })
})
