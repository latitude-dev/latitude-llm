import { createFakeAI } from "@domain/ai/testing"
import { SignalId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { refreshSignalDetailsUseCase } from "./refresh-signal-details.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"

const makeSignal = (promotedAt: Date | null): Signal => ({
  id: SignalId(signalId),
  organizationId,
  projectId,
  slug: "acme-0001",
  name: "The assistant leaks API tokens in its response",
  description: "The assistant leaks API tokens in its response.",
  source: "flagger",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  promotedAt,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
})

describe("refreshSignalDetailsUseCase", () => {
  it("leaves an unpromoted signal on its placeholder and calls no model", async () => {
    // `ScoreAssignedToSignal` schedules this task for candidates too. Generating
    // there would spend a model call to make matching worse — the placeholder is
    // the occurrence's own feedback, which is the better rerank document for a
    // cluster this thin, and the summary replacing it would come from the same
    // one or two members that make the task ill-posed in the first place.
    const { layer: aiLayer, calls } = createFakeAI()
    const { repository, issues } = createFakeSignalRepository([makeSignal(null)])

    const result = await Effect.runPromise(
      refreshSignalDetailsUseCase({ organizationId, projectId, signalId }).pipe(
        Effect.provide(aiLayer),
        Effect.provideService(SignalRepository, repository),
      ),
    )

    expect(result).toEqual({ action: "unpromoted", signalId })
    expect(calls.generate).toHaveLength(0)
    expect(issues.get(signalId)?.name).toBe("The assistant leaks API tokens in its response")
  })
})
