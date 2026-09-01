import { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, SettingsReader, SignalId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { type SubmitSignalFeedbackInput, submitSignalFeedbackUseCase } from "./submit-signal-feedback.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const otherProjectId = "qqqqqqqqqqqqqqqqqqqqqqqq"
const signalId = SignalId("a".repeat(24))
const now = new Date("2026-08-17T12:00:00.000Z")
const earlier = new Date("2026-08-01T00:00:00.000Z")

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId,
  projectId,
  slug: "assistant-leaks-prompts",
  name: "Assistant leaks internal prompts",
  description: "The assistant reveals its system prompt when asked indirectly.",
  source: "flagger",
  origin: "system",
  scoreEvidence: [],
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  promotedAt: earlier,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  feedback: null,
  deletedAt: null,
  createdAt: earlier,
  updatedAt: earlier,
  ...overrides,
})

const run = (input: {
  readonly signals?: readonly Signal[]
  readonly feedback?: Omit<SubmitSignalFeedbackInput, "projectId" | "signalId" | "now">
  readonly projectId?: string
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository(input.signals ?? [makeSignal()])
  const softDeletedSignalIds: string[] = []
  const evaluationRepository = EvaluationRepository.of({
    findById: () => Effect.die("Unexpected findById"),
    save: () => Effect.die("Unexpected save"),
    listByProjectId: () => Effect.die("Unexpected listByProjectId"),
    listBySignalId: () => Effect.die("Unexpected listBySignalId"),
    listBySignalIds: () => Effect.die("Unexpected listBySignalIds"),
    archive: () => Effect.die("Unexpected archive"),
    unarchive: () => Effect.die("Unexpected unarchive"),
    softDelete: () => Effect.die("Unexpected softDelete"),
    softDeleteBySignalId: ({ signalId: id }) => Effect.sync(() => void softDeletedSignalIds.push(id)),
  })
  const events: OutboxWriteEvent[] = []
  const writer = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  const settingsReader = SettingsReader.of({
    getProjectSettings: () => Effect.succeed(null),
    getOrganizationSettings: () => Effect.succeed(null),
  })

  const submit = (overrides: Partial<SubmitSignalFeedbackInput> = {}) =>
    submitSignalFeedbackUseCase({
      projectId: input.projectId ?? projectId,
      signalId,
      passed: true,
      ...input.feedback,
      ...overrides,
      now,
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(SignalRepository, signalRepository),
          Layer.succeed(EvaluationRepository, evaluationRepository),
          Layer.succeed(OutboxEventWriter, writer),
          Layer.succeed(SettingsReader, settingsReader),
        ),
      ),
      Effect.provideService(SqlClient, createPassthroughSqlClient()),
    )

  return { submit, issues, events, softDeletedSignalIds }
}

describe("submitSignalFeedbackUseCase", () => {
  it("stamps the verdict on the signal and emits SignalFeedbackSubmitted", async () => {
    const { submit, issues, events } = run({})

    const result = await Effect.runPromise(submit({ passed: true, feedback: "  Caught a real regression  " }))

    expect(result).toEqual({
      signalId,
      feedback: { value: 1, passed: true, feedback: "Caught a real regression" },
      ignored: false,
    })
    expect(issues.get(signalId)?.feedback).toEqual({ value: 1, passed: true, feedback: "Caught a real regression" })
    expect(issues.get(signalId)?.updatedAt).toEqual(now)
    expect(events).toEqual([
      {
        eventName: "SignalFeedbackSubmitted",
        aggregateType: "issue",
        aggregateId: signalId,
        organizationId,
        payload: {
          organizationId,
          projectId,
          signalId,
          value: 1,
          passed: true,
          feedback: "Caught a real regression",
        },
      },
    ])
  })

  it("derives value from the polarity and honours an explicit one", async () => {
    const { submit } = run({})
    const confirmed = await Effect.runPromise(submit({ passed: true }))
    expect(confirmed.feedback).toEqual({ value: 1, passed: true, feedback: "" })

    const { submit: submitRejected } = run({})
    const rejected = await Effect.runPromise(submitRejected({ passed: false, feedback: "Never a problem" }))
    expect(rejected.feedback.value).toBe(0)

    const { submit: submitExplicit } = run({})
    const explicit = await Effect.runPromise(submitExplicit({ passed: true, value: 0.5 }))
    expect(explicit.feedback.value).toBe(0.5)
  })

  it("refuses a false-positive verdict without a reason", async () => {
    const { submit, issues, events } = run({})

    const error = await Effect.runPromise(Effect.flip(submit({ passed: false, feedback: "   " })))

    expect(error._tag).toBe("SignalFeedbackReasonRequiredError")
    expect(issues.get(signalId)?.feedback).toBeNull()
    expect(events).toEqual([])
  })

  it("refuses a second submission and leaves the first verdict standing", async () => {
    const { submit, issues, events } = run({})
    await Effect.runPromise(submit({ passed: true, feedback: "Real" }))

    const error = await Effect.runPromise(Effect.flip(submit({ passed: false, feedback: "Changed my mind" })))

    expect(error._tag).toBe("SignalFeedbackAlreadySubmittedError")
    expect(issues.get(signalId)?.feedback).toEqual({ value: 1, passed: true, feedback: "Real" })
    expect(events).toHaveLength(1)
  })

  it("archives the signal when asked to ignore it", async () => {
    const { submit, issues, events, softDeletedSignalIds } = run({})

    const result = await Effect.runPromise(submit({ passed: false, feedback: "False positive", ignore: true }))

    expect(result.ignored).toBe(true)
    expect(issues.get(signalId)?.ignoredAt).toEqual(now)
    expect(issues.get(signalId)?.mutedAt).toEqual(now)
    expect(softDeletedSignalIds).toEqual([signalId])
    expect(events.map((event) => event.eventName)).toEqual(["SignalFeedbackSubmitted", "SignalEscalationEnded"])
  })

  it("leaves the signal active without the ignore shortcut", async () => {
    const { submit, issues } = run({})

    await Effect.runPromise(submit({ passed: false, feedback: "False positive" }))

    expect(issues.get(signalId)?.ignoredAt).toBeNull()
  })

  it("rejects a signal from another project", async () => {
    const { submit, issues } = run({ projectId: otherProjectId })

    const error = await Effect.runPromise(Effect.flip(submit({ passed: true })))

    expect(error._tag).toBe("BadRequestError")
    expect(issues.get(signalId)?.feedback).toBeNull()
  })

  it("refuses a signal that no flagger detected", async () => {
    for (const source of ["annotation", "custom"] as const) {
      const { submit, issues, events } = run({ signals: [makeSignal({ source })] })

      const error = await Effect.runPromise(Effect.flip(submit({ passed: true, feedback: "Useful" })))

      expect(error._tag).toBe("SignalFeedbackNotSupportedError")
      expect(issues.get(signalId)?.feedback).toBeNull()
      expect(events).toEqual([])
    }
  })

  it("rejects an unpromoted signal", async () => {
    const { submit } = run({ signals: [makeSignal({ promotedAt: null })] })

    const error = await Effect.runPromise(Effect.flip(submit({ passed: true })))

    expect(error._tag).toBe("NotFoundError")
  })
})
