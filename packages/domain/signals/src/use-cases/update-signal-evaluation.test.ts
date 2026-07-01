import {
  compileSettingsToScript,
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
} from "@domain/evaluations"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import {
  EvaluationId,
  type EvaluationSettings,
  OrganizationId,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { updateSignalEvaluationUseCase } from "./update-signal-evaluation.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const signalId = "ssssssssssssssssssssssss"
const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

const ruleSettings: EvaluationSettings = {
  kind: "rule",
  match: "all",
  conditions: [{ type: "error" }],
}
const nextSettings: EvaluationSettings = {
  kind: "rule",
  match: "all",
  conditions: [{ type: "empty_output" }],
}

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
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  ...overrides,
})

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: EvaluationId(evaluationId),
  organizationId,
  projectId,
  signalId,
  name: "Slow checkout",
  description: "",
  settings: ruleSettings,
  script: compileSettingsToScript(ruleSettings),
  scriptHash: "hash-old",
  trigger: defaultEvaluationTrigger(),
  alignment: null,
  alignedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  ...overrides,
})

const makeEvaluationRepository = (evaluations: readonly Evaluation[]) => {
  const saved: Evaluation[] = []
  const repository = EvaluationRepository.of({
    findById: () => Effect.die("not used"),
    save: (evaluation) => Effect.sync(() => void saved.push(evaluation)),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    listBySignalId: () => Effect.succeed({ items: [...evaluations], hasMore: false, limit: 100, offset: 0 }),
    listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 100, offset: 0 }),
    archive: () => Effect.void,
    unarchive: () => Effect.void,
    softDelete: () => Effect.void,
    softDeleteBySignalId: () => Effect.void,
  })
  return { repository, saved }
}

const provide = (signal: Signal, evaluations: readonly Evaluation[]) => {
  const { repository: signalRepository } = createFakeSignalRepository([signal])
  const { repository: evaluationRepository, saved } = makeEvaluationRepository(evaluations)
  const layer = Layer.mergeAll(
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(EvaluationRepository, evaluationRepository),
    Layer.succeed(SqlClient, createPassthroughSqlClient()),
    createFakeScriptRuntime().layer,
  )
  return { layer, saved }
}

describe("updateSignalEvaluationUseCase", () => {
  it("recompiles the active evaluation in place from new settings", async () => {
    const { layer, saved } = provide(makeSignal(), [makeEvaluation()])

    const result = await Effect.runPromise(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { settings: nextSettings },
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toMatchObject({ signalId, evaluationId, changed: true })
    expect(saved).toHaveLength(1)
    expect(saved[0]?.id).toBe(evaluationId)
    expect(saved[0]?.settings).toEqual(nextSettings)
    expect(saved[0]?.script).toBe(compileSettingsToScript(nextSettings))
    expect(saved[0]?.alignment).toBeNull()
  })

  it("is a no-op when the compiled script is unchanged", async () => {
    const { layer, saved } = provide(makeSignal(), [makeEvaluation()])

    const result = await Effect.runPromise(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { settings: ruleSettings },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.changed).toBe(false)
    expect(saved).toHaveLength(0)
  })

  it("rejects system-origin signals", async () => {
    const { layer } = provide(makeSignal({ origin: "system" }), [makeEvaluation()])

    const result = await Effect.runPromiseExit(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { settings: nextSettings },
      }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })

  it("rejects a settings payload for a raw-script evaluation (no conversion)", async () => {
    const { layer } = provide(makeSignal(), [makeEvaluation({ settings: null, script: "return Passed()" })])

    const result = await Effect.runPromiseExit(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { settings: nextSettings },
      }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })

  it("updates a raw-script evaluation in place from a new script", async () => {
    const { layer, saved } = provide(makeSignal(), [makeEvaluation({ settings: null, script: "return Passed(1)" })])

    const result = await Effect.runPromise(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { script: "return Failed(0)" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toMatchObject({ signalId, evaluationId, changed: true })
    expect(saved).toHaveLength(1)
    expect(saved[0]?.settings).toBeNull()
    expect(saved[0]?.script).toBe("return Failed(0)")
    expect(saved[0]?.alignment).toBeNull()
  })

  it("rejects a script payload for a settings-defined evaluation (no conversion)", async () => {
    const { layer } = provide(makeSignal(), [makeEvaluation()])

    const result = await Effect.runPromiseExit(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { script: "return Passed(1)" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })

  it("rejects when the signal has no active evaluation", async () => {
    const { layer } = provide(makeSignal(), [])

    const result = await Effect.runPromiseExit(
      updateSignalEvaluationUseCase({
        projectId,
        signalId: SignalId(signalId),
        evaluation: { settings: nextSettings },
      }).pipe(Effect.provide(layer)),
    )

    expect(result._tag).toBe("Failure")
  })
})
