import {
  defaultEvaluationTrigger,
  type Evaluation,
  EvaluationRepository,
  emptyEvaluationAlignment,
} from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { EvaluationId, OrganizationId, SettingsReader, SignalId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/issue.ts"
import { createSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/issue-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-issue-repository.ts"
import { applySignalLifecycleCommandUseCase } from "./apply-issue-lifecycle-command.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Signal lifecycle candidate",
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

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  id: EvaluationId("eeeeeeeeeeeeeeeeeeeeeeee"),
  organizationId,
  projectId,
  signalId: SignalId("iiiiiiiiiiiiiiiiiiiiiiii"),
  name: "Monitor the issue",
  description: "Generated evaluation",
  script: "return { passed: false }",
  trigger: defaultEvaluationTrigger(),
  alignment: emptyEvaluationAlignment("hash-v1"),
  alignedAt: new Date("2026-03-20T10:00:00.000Z"),
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-03-20T10:00:00.000Z"),
  updatedAt: new Date("2026-03-20T10:00:00.000Z"),
  ...overrides,
})

const createFakeEvaluationRepository = (seed: readonly Evaluation[] = []) => {
  const evaluations = new Map(seed.map((evaluation) => [evaluation.id, evaluation] as const))
  const softDeleteBySignalIdCalls: Array<{ projectId: string; signalId: string }> = []

  return {
    evaluations,
    softDeleteBySignalIdCalls,
    repository: {
      findById: (id: string) =>
        Effect.sync(() => {
          const evaluation = evaluations.get(EvaluationId(id))

          if (!evaluation) {
            throw new Error(`Missing evaluation ${id}`)
          }

          return evaluation
        }),
      save: (evaluation: Evaluation) =>
        Effect.sync(() => {
          evaluations.set(evaluation.id, evaluation)
        }),
      listByProjectId: ({ projectId }: { readonly projectId: string }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter((evaluation) => evaluation.projectId === projectId),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      listBySignalId: ({ projectId, signalId }: { readonly projectId: string; readonly signalId: string }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter(
            (evaluation) => evaluation.projectId === projectId && evaluation.signalId === signalId,
          ),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      listBySignalIds: ({
        projectId,
        signalIds,
      }: {
        readonly projectId: string
        readonly signalIds: readonly string[]
      }) =>
        Effect.sync(() => ({
          items: [...evaluations.values()].filter(
            (evaluation) => evaluation.projectId === projectId && signalIds.includes(evaluation.signalId),
          ),
          hasMore: false,
          limit: evaluations.size,
          offset: 0,
        })),
      archive: (id: string) =>
        Effect.sync(() => {
          const evaluation = evaluations.get(EvaluationId(id))
          if (!evaluation) {
            return
          }

          evaluations.set(EvaluationId(id), {
            ...evaluation,
            archivedAt: new Date("2026-04-20T00:00:00.000Z"),
            updatedAt: new Date("2026-04-20T00:00:00.000Z"),
          })
        }),
      unarchive: (_id: string) => Effect.void,
      softDelete: (_id: string) => Effect.void,
      softDeleteBySignalId: ({ projectId, signalId }: { readonly projectId: string; readonly signalId: string }) =>
        Effect.sync(() => {
          softDeleteBySignalIdCalls.push({ projectId, signalId })

          for (const evaluation of evaluations.values()) {
            if (
              evaluation.projectId === projectId &&
              evaluation.signalId === signalId &&
              evaluation.deletedAt === null
            ) {
              evaluations.set(EvaluationId(evaluation.id), {
                ...evaluation,
                deletedAt: new Date("2026-04-20T00:00:00.000Z"),
                updatedAt: new Date("2026-04-20T00:00:00.000Z"),
              })
            }
          }
        }),
    },
  }
}

const makeSettingsReader = (input: {
  readonly organizationKeepMonitoring?: boolean
  readonly projectKeepMonitoring?: boolean
}) =>
  Layer.succeed(SettingsReader, {
    getOrganizationSettings: () =>
      Effect.succeed(
        input.organizationKeepMonitoring === undefined ? null : { keepMonitoring: input.organizationKeepMonitoring },
      ),
    getProjectSettings: () =>
      Effect.succeed(
        input.projectKeepMonitoring === undefined ? null : { keepMonitoring: input.projectKeepMonitoring },
      ),
  })

const makeProvider = (input: {
  readonly signalRepository: ReturnType<typeof createFakeSignalRepository>["repository"]
  readonly evaluationRepository: ReturnType<typeof createFakeEvaluationRepository>["repository"]
  readonly organizationKeepMonitoring?: boolean
  readonly projectKeepMonitoring?: boolean
  // Optional sink that captures every outbox event the use-case writes, so
  // tests can assert on the emitted `SignalEscalationEnded` events.
  readonly events?: OutboxWriteEvent[]
}) => {
  const settingsReaderInput: {
    organizationKeepMonitoring?: boolean
    projectKeepMonitoring?: boolean
  } = {}

  if (input.organizationKeepMonitoring !== undefined) {
    settingsReaderInput.organizationKeepMonitoring = input.organizationKeepMonitoring
  }

  if (input.projectKeepMonitoring !== undefined) {
    settingsReaderInput.projectKeepMonitoring = input.projectKeepMonitoring
  }

  const events = input.events ?? []

  return Layer.mergeAll(
    Layer.succeed(SignalRepository, input.signalRepository),
    Layer.succeed(EvaluationRepository, input.evaluationRepository),
    makeSettingsReader(settingsReaderInput),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OrganizationId(organizationId) })),
    Layer.succeed(OutboxEventWriter, {
      write: (event: OutboxWriteEvent) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  )
}

describe("applySignalLifecycleCommandUseCase", () => {
  it("resolves issues using the project-over-organization keepMonitoring default", async () => {
    const now = new Date("2026-04-10T12:00:00.000Z")
    const issue = makeSignal()
    const evaluation = makeEvaluation()
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteBySignalIdCalls,
    } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "resolve",
        now,
      }).pipe(
        Effect.provide(
          makeProvider({
            signalRepository,
            evaluationRepository,
            organizationKeepMonitoring: false,
            projectKeepMonitoring: true,
          }),
        ),
      ),
    )

    expect(result.keepMonitoring).toBe(true)
    expect(result.items).toEqual([
      {
        signalId: issue.id,
        resolvedAt: now,
        ignoredAt: null,
        updatedAt: now,
        changed: true,
      },
    ])
    expect(issues.get(issue.id)?.resolvedAt).toEqual(now)
    expect(softDeleteBySignalIdCalls).toEqual([])
    expect(evaluations.get(evaluation.id)?.deletedAt).toBeNull()
  })

  it("soft deletes linked evaluations when resolving with keepMonitoring=false", async () => {
    const now = new Date("2026-04-11T09:00:00.000Z")
    const firstSignal = makeSignal({
      id: SignalId("aaaaaaaaaaaaaaaaaaaaaaaa"),
    })
    const secondSignal = makeSignal({
      id: SignalId("bbbbbbbbbbbbbbbbbbbbbbbb"),
    })
    const firstEvaluation = makeEvaluation({
      id: EvaluationId("cccccccccccccccccccccccc"),
      signalId: firstSignal.id,
    })
    const secondEvaluation = makeEvaluation({
      id: EvaluationId("dddddddddddddddddddddddd"),
      signalId: secondSignal.id,
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository([firstSignal, secondSignal])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteBySignalIdCalls,
    } = createFakeEvaluationRepository([firstEvaluation, secondEvaluation])

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [firstSignal.id, secondSignal.id, firstSignal.id],
        command: "resolve",
        keepMonitoring: false,
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository }))),
    )

    expect(result.keepMonitoring).toBe(false)
    expect(result.items).toHaveLength(2)
    expect(softDeleteBySignalIdCalls).toEqual([
      { projectId, signalId: firstSignal.id },
      { projectId, signalId: secondSignal.id },
    ])
    expect(issues.get(firstSignal.id)?.resolvedAt).toEqual(now)
    expect(issues.get(secondSignal.id)?.resolvedAt).toEqual(now)
    expect(evaluations.get(firstEvaluation.id)?.deletedAt).not.toBeNull()
    expect(evaluations.get(secondEvaluation.id)?.deletedAt).not.toBeNull()
  })

  it("soft deletes linked evaluations immediately when ignoring an issue", async () => {
    const now = new Date("2026-04-12T09:00:00.000Z")
    const issue = makeSignal()
    const evaluation = makeEvaluation()
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteBySignalIdCalls,
    } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "ignore",
        now,
      }).pipe(
        Effect.provide(
          makeProvider({
            signalRepository,
            evaluationRepository,
            organizationKeepMonitoring: true,
          }),
        ),
      ),
    )

    expect(result.keepMonitoring).toBeNull()
    expect(issues.get(issue.id)?.ignoredAt).toEqual(now)
    expect(softDeleteBySignalIdCalls).toEqual([{ projectId, signalId: issue.id }])
    expect(evaluations.get(evaluation.id)?.deletedAt).not.toBeNull()
  })

  it("clears resolved and ignored flags without reactivating evaluations", async () => {
    const now = new Date("2026-04-13T09:00:00.000Z")
    const issue = makeSignal({
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
      ignoredAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const archivedEvaluation = makeEvaluation({
      archivedAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])
    const {
      repository: evaluationRepository,
      evaluations,
      softDeleteBySignalIdCalls,
    } = createFakeEvaluationRepository([archivedEvaluation])

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "unresolve",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository }))),
    )
    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "unignore",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository }))),
    )

    expect(issues.get(issue.id)?.resolvedAt).toBeNull()
    expect(issues.get(issue.id)?.ignoredAt).toBeNull()
    expect(issues.get(issue.id)?.updatedAt).toEqual(now)
    expect(softDeleteBySignalIdCalls).toEqual([])
    expect(evaluations.get(archivedEvaluation.id)?.archivedAt).toEqual(new Date("2026-04-02T00:00:00.000Z"))
  })

  it("is idempotent when a lifecycle flag is already set", async () => {
    const issue = makeSignal({
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
    })
    const evaluation = makeEvaluation()
    const { repository: signalRepository, issues } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository, softDeleteBySignalIdCalls } = createFakeEvaluationRepository([evaluation])

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "resolve",
        keepMonitoring: false,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository }))),
    )

    expect(result.items[0]?.changed).toBe(false)
    expect(issues.get(issue.id)?.resolvedAt).toEqual(new Date("2026-04-01T00:00:00.000Z"))
    expect(softDeleteBySignalIdCalls).toEqual([])
  })

  it("rejects issues that do not belong to the requested project", async () => {
    const issue = makeSignal({
      projectId: otherProjectId,
    })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()

    await expect(
      Effect.runPromise(
        applySignalLifecycleCommandUseCase({
          projectId,
          signalIds: [issue.id],
          command: "ignore",
        }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository }))),
      ),
    ).rejects.toMatchObject({
      _tag: "BadRequestError",
    })
  })

  it("emits SignalEscalationEnded with reason='resolved' when resolving changes the issue", async () => {
    const now = new Date("2026-04-14T09:00:00.000Z")
    const issue = makeSignal()
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()
    const events: OutboxWriteEvent[] = []

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "resolve",
        keepMonitoring: true,
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "SignalEscalationEnded",
      aggregateType: "issue",
      aggregateId: issue.id,
      organizationId,
      payload: {
        organizationId,
        projectId,
        signalId: issue.id,
        endedAt: now.toISOString(),
        reason: "resolved",
      },
    })
  })

  it("emits SignalEscalationEnded with reason='ignored' when ignoring changes the issue", async () => {
    const now = new Date("2026-04-14T10:00:00.000Z")
    const issue = makeSignal()
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()
    const events: OutboxWriteEvent[] = []

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "ignore",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "SignalEscalationEnded",
      payload: { signalId: issue.id, reason: "ignored" },
    })
  })

  it("emits no event when the lifecycle command is a no-op (already resolved)", async () => {
    const issue = makeSignal({ resolvedAt: new Date("2026-04-01T00:00:00.000Z") })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()
    const events: OutboxWriteEvent[] = []

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "resolve",
        keepMonitoring: true,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )

    expect(events).toEqual([])
  })

  it("emits no escalation-ended event for unresolve / unignore", async () => {
    const now = new Date("2026-04-15T09:00:00.000Z")
    const issue = makeSignal({
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
      ignoredAt: new Date("2026-04-02T00:00:00.000Z"),
    })
    const { repository: signalRepository } = createFakeSignalRepository([issue])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()
    const events: OutboxWriteEvent[] = []

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "unresolve",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )
    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [issue.id],
        command: "unignore",
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )

    expect(events).toEqual([])
  })

  it("emits one escalation-ended event per changed issue on a bulk resolve", async () => {
    const now = new Date("2026-04-16T09:00:00.000Z")
    const firstSignal = makeSignal({ id: SignalId("aaaaaaaaaaaaaaaaaaaaaaaa") })
    // Already resolved → no-op → no event.
    const secondSignal = makeSignal({
      id: SignalId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
    })
    const thirdSignal = makeSignal({ id: SignalId("cccccccccccccccccccccccc") })
    const { repository: signalRepository } = createFakeSignalRepository([firstSignal, secondSignal, thirdSignal])
    const { repository: evaluationRepository } = createFakeEvaluationRepository()
    const events: OutboxWriteEvent[] = []

    await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId,
        signalIds: [firstSignal.id, secondSignal.id, thirdSignal.id],
        command: "resolve",
        keepMonitoring: true,
        now,
      }).pipe(Effect.provide(makeProvider({ signalRepository, evaluationRepository, events }))),
    )

    expect(events).toHaveLength(2)
    expect(events.map((event) => (event.payload as { signalId: string }).signalId)).toEqual([
      firstSignal.id,
      thirdSignal.id,
    ])
    expect(events.every((event) => event.eventName === "SignalEscalationEnded")).toBe(true)
  })
})
