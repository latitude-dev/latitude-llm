import { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import {
  OrganizationId,
  type ProjectSettings,
  SettingsReader,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { applySignalLifecycleCommandUseCase } from "./apply-signal-lifecycle-command.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const now = new Date("2026-07-01T12:00:00.000Z")
const earlier = new Date("2026-06-01T00:00:00.000Z")

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(organizationId),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeSignal = (id: string, overrides: Partial<Signal> = {}): Signal => ({
  id: SignalId(id),
  organizationId,
  projectId,
  slug: `signal-${id.slice(-4)}`,
  name: "Assistant leaks internal prompts",
  description: "The assistant reveals its system prompt when asked indirectly.",
  source: "annotation",
  origin: "system",
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
  deletedAt: null,
  createdAt: earlier,
  updatedAt: earlier,
  ...overrides,
})

const createEvaluationRepository = () => {
  const softDeletedSignalIds: string[] = []
  const repository = EvaluationRepository.of({
    findById: () => Effect.die("Unexpected findById"),
    save: () => Effect.die("Unexpected save"),
    listByProjectId: () => Effect.die("Unexpected listByProjectId"),
    listBySignalId: () => Effect.die("Unexpected listBySignalId"),
    listBySignalIds: () => Effect.die("Unexpected listBySignalIds"),
    archive: () => Effect.die("Unexpected archive"),
    unarchive: () => Effect.die("Unexpected unarchive"),
    softDelete: () => Effect.die("Unexpected softDelete"),
    softDeleteBySignalId: ({ signalId }) => Effect.sync(() => void softDeletedSignalIds.push(signalId)),
  })
  return { repository, softDeletedSignalIds }
}

const createOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const writer = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { writer, events }
}

const run = (input: {
  readonly signals: readonly Signal[]
  readonly command: Parameters<typeof applySignalLifecycleCommandUseCase>[0]["command"]
  readonly signalIds?: readonly string[]
  readonly keepMonitoring?: boolean
  readonly projectSettings?: ProjectSettings | null
  readonly organizationSettings?: { keepMonitoring?: boolean } | null
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository(input.signals)
  const { repository: evaluationRepository, softDeletedSignalIds } = createEvaluationRepository()
  const { writer, events } = createOutboxEventWriter()
  const settingsReader = SettingsReader.of({
    getProjectSettings: () => Effect.succeed(input.projectSettings ?? null),
    getOrganizationSettings: () => Effect.succeed(input.organizationSettings ?? null),
  })

  const effect = applySignalLifecycleCommandUseCase({
    projectId,
    signalIds: (input.signalIds ?? input.signals.map((signal) => signal.id)).map((id) => SignalId(id)),
    command: input.command,
    ...(input.keepMonitoring !== undefined ? { keepMonitoring: input.keepMonitoring } : {}),
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

  return { effect, issues, events, softDeletedSignalIds }
}

describe("applySignalLifecycleCommandUseCase", () => {
  describe("resolve", () => {
    it("stamps resolvedAt and clears ignoredAt and regressedAt", async () => {
      const signal = makeSignal("a".repeat(24), { regressedAt: earlier })
      const { effect, issues } = run({ signals: [signal], command: "resolve" })

      const result = await Effect.runPromise(effect)

      expect(result.items).toEqual([
        expect.objectContaining({ signalId: signal.id, resolvedAt: now, regressedAt: null, changed: true }),
      ])
      expect(issues.get(signal.id)).toMatchObject({ resolvedAt: now, ignoredAt: null, regressedAt: null })
    })

    it("clears an ignore and its auto-mute when resolving an ignored signal", async () => {
      const signal = makeSignal("a".repeat(24), { ignoredAt: earlier, mutedAt: earlier })
      const { effect, issues } = run({ signals: [signal], command: "resolve" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ resolvedAt: now, ignoredAt: null, mutedAt: null })
    })

    it("releases an explicit mute so regression alerts can fire", async () => {
      const signal = makeSignal("a".repeat(24), { mutedAt: earlier })
      const { effect, issues } = run({ signals: [signal], command: "resolve" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ resolvedAt: now, mutedAt: null })
    })

    it("is idempotent on an already-resolved signal", async () => {
      const signal = makeSignal("a".repeat(24), { resolvedAt: earlier })
      const { effect, issues, events } = run({ signals: [signal], command: "resolve" })

      const result = await Effect.runPromise(effect)

      expect(result.items[0]).toMatchObject({ resolvedAt: earlier, changed: false })
      expect(issues.get(signal.id)?.updatedAt).toEqual(earlier)
      expect(events).toEqual([])
    })

    it("defaults keepMonitoring from project settings over organization settings", async () => {
      const signal = makeSignal("a".repeat(24))
      const { effect, softDeletedSignalIds } = run({
        signals: [signal],
        command: "resolve",
        projectSettings: { keepMonitoring: false },
        organizationSettings: { keepMonitoring: true },
      })

      const result = await Effect.runPromise(effect)

      expect(result.keepMonitoring).toBe(false)
      expect(softDeletedSignalIds).toEqual([signal.id])
    })

    it("keeps the detector by default (system default keepMonitoring = true)", async () => {
      const signal = makeSignal("a".repeat(24))
      const { effect, softDeletedSignalIds } = run({ signals: [signal], command: "resolve" })

      const result = await Effect.runPromise(effect)

      expect(result.keepMonitoring).toBe(true)
      expect(softDeletedSignalIds).toEqual([])
    })

    it("archives linked evaluations when keepMonitoring is explicitly false", async () => {
      const signal = makeSignal("a".repeat(24))
      const { effect, softDeletedSignalIds } = run({
        signals: [signal],
        command: "resolve",
        keepMonitoring: false,
        projectSettings: { keepMonitoring: true },
      })

      await Effect.runPromise(effect)

      expect(softDeletedSignalIds).toEqual([signal.id])
    })

    it("emits one SignalEscalationEnded per changed signal on a bulk resolve", async () => {
      const changed = makeSignal("a".repeat(24))
      const alreadyResolved = makeSignal("b".repeat(24), { resolvedAt: earlier })
      const { effect, events } = run({ signals: [changed, alreadyResolved], command: "resolve" })

      await Effect.runPromise(effect)

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        eventName: "SignalEscalationEnded",
        aggregateType: "issue",
        aggregateId: changed.id,
        payload: { signalId: changed.id, reason: "resolved", endedAt: now.toISOString() },
      })
    })
  })

  describe("ignore", () => {
    it("stamps ignoredAt, clears resolvedAt/regressedAt, auto-mutes, and archives evaluations", async () => {
      const signal = makeSignal("a".repeat(24), { resolvedAt: earlier, regressedAt: earlier })
      const { effect, issues, events, softDeletedSignalIds } = run({ signals: [signal], command: "ignore" })

      const result = await Effect.runPromise(effect)

      expect(result.keepMonitoring).toBeNull()
      expect(issues.get(signal.id)).toMatchObject({
        ignoredAt: now,
        resolvedAt: null,
        regressedAt: null,
        mutedAt: now,
      })
      expect(softDeletedSignalIds).toEqual([signal.id])
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ payload: { reason: "ignored" } })
    })

    it("keeps an existing mute timestamp instead of overwriting it", async () => {
      const signal = makeSignal("a".repeat(24), { mutedAt: earlier })
      const { effect, issues } = run({ signals: [signal], command: "ignore" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ ignoredAt: now, mutedAt: earlier })
    })

    it("is idempotent on an already-ignored signal (no re-mute, no events, no archive)", async () => {
      const signal = makeSignal("a".repeat(24), { ignoredAt: earlier, mutedAt: null })
      const { effect, issues, events, softDeletedSignalIds } = run({ signals: [signal], command: "ignore" })

      const result = await Effect.runPromise(effect)

      expect(result.items[0]).toMatchObject({ changed: false })
      // A user who unmuted after ignoring stays unmuted.
      expect(issues.get(signal.id)?.mutedAt).toBeNull()
      expect(events).toEqual([])
      expect(softDeletedSignalIds).toEqual([])
    })
  })

  describe("unresolve / unignore", () => {
    it("unresolve clears resolvedAt and the mute, emitting nothing", async () => {
      const signal = makeSignal("a".repeat(24), { resolvedAt: earlier, mutedAt: earlier })
      const { effect, issues, events, softDeletedSignalIds } = run({ signals: [signal], command: "unresolve" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ resolvedAt: null, mutedAt: null })
      expect(events).toEqual([])
      expect(softDeletedSignalIds).toEqual([])
    })

    it("unignore clears ignoredAt and releases the mute", async () => {
      const signal = makeSignal("a".repeat(24), { ignoredAt: earlier, mutedAt: earlier })
      const { effect, issues, events } = run({ signals: [signal], command: "unignore" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ ignoredAt: null, mutedAt: null })
      expect(events).toEqual([])
    })

    it("un-commands never resurrect archived evaluations", async () => {
      const signal = makeSignal("a".repeat(24), { ignoredAt: earlier })
      const { effect, softDeletedSignalIds } = run({ signals: [signal], command: "unignore" })

      await Effect.runPromise(effect)

      expect(softDeletedSignalIds).toEqual([])
    })
  })

  describe("mute / unmute", () => {
    it("mute touches only mutedAt — lifecycle stamps, evaluations, and events stay put", async () => {
      const signal = makeSignal("a".repeat(24), { resolvedAt: earlier })
      const { effect, issues, events, softDeletedSignalIds } = run({ signals: [signal], command: "mute" })

      const result = await Effect.runPromise(effect)

      expect(result.keepMonitoring).toBeNull()
      expect(issues.get(signal.id)).toMatchObject({ mutedAt: now, resolvedAt: earlier })
      expect(events).toEqual([])
      expect(softDeletedSignalIds).toEqual([])
    })

    it("unmute clears mutedAt on an ignored signal without unignoring it", async () => {
      const signal = makeSignal("a".repeat(24), { ignoredAt: earlier, mutedAt: earlier })
      const { effect, issues } = run({ signals: [signal], command: "unmute" })

      await Effect.runPromise(effect)

      expect(issues.get(signal.id)).toMatchObject({ mutedAt: null, ignoredAt: earlier })
    })
  })

  describe("batch semantics", () => {
    it("rejects the whole batch when a signal belongs to another project", async () => {
      const local = makeSignal("a".repeat(24))
      const foreign = makeSignal("b".repeat(24), { projectId: "x".repeat(24) })
      const { effect, issues } = run({
        signals: [local, foreign],
        command: "resolve",
      })

      await expect(Effect.runPromise(effect)).rejects.toMatchObject({ _tag: "BadRequestError" })

      // The failure aborts the surrounding transaction, so earlier writes in
      // the batch roll back in the real adapter; the in-memory fake only shows
      // that the failing signal itself was never stamped.
      expect(issues.get(foreign.id)?.resolvedAt).toBeNull()
    })

    it("dedupes repeated signal ids", async () => {
      const signal = makeSignal("a".repeat(24))
      const { effect, events } = run({
        signals: [signal],
        command: "ignore",
        signalIds: [signal.id, signal.id],
      })

      const result = await Effect.runPromise(effect)

      expect(result.items).toHaveLength(1)
      expect(events).toHaveLength(1)
    })

    it("rejects lifecycle commands on unpromoted candidates", async () => {
      const candidate = makeSignal("c".repeat(24), { promotedAt: null })
      const { effect, issues } = run({ signals: [candidate], command: "ignore" })

      await expect(Effect.runPromise(effect)).rejects.toMatchObject({ _tag: "BadRequestError" })
      expect(issues.get(candidate.id)?.ignoredAt).toBeNull()
    })
  })
})
