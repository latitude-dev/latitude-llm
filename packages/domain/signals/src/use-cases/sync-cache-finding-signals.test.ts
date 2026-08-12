import { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Project, ProjectRepository } from "@domain/projects"
import {
  generateId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SettingsReader,
  SignalId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import type { CacheModelJudgment, JudgedCacheModel } from "@domain/spans"
import { CACHE_SIGNAL_MIN_CALLS, CACHE_SIGNAL_STABILITY_WINDOWS, cacheFindingFingerprint } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { CacheFinding } from "../entities/cache-finding.ts"
import type { Signal } from "../entities/signal.ts"
import { CacheFindingRepository, type CacheFindingSignalStatus } from "../ports/cache-finding-repository.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { syncCacheFindingSignalsUseCase } from "./sync-cache-finding-signals.ts"

const organizationId = OrganizationId("oooooooooooooooooooooooo")
const projectId = ProjectId("pppppppppppppppppppppppp")
const now = new Date("2026-08-05T00:00:00.000Z")

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId,
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const judgment = (overrides: Partial<CacheModelJudgment> = {}): CacheModelJudgment => ({
  state: "investigate",
  urgency: "underusing",
  cachingOn: true,
  actualRate: 0.1,
  ceilingRate: 0.86,
  breakEvenRate: 0.217,
  modeledSavingsMicrocents: 500_000_000,
  savingsClearsFloor: true,
  ...overrides,
})

const row = (overrides: Partial<JudgedCacheModel> = {}): JudgedCacheModel => ({
  provider: "anthropic",
  model: "claude-haiku-4-5",
  calls: CACHE_SIGNAL_MIN_CALLS * 4,
  inputTokens: 40_000_000,
  cacheReadTokens: 5_000_000,
  cacheCreateTokens: 1_000_000,
  costMicrocents: 20_000_000_000,
  unpricedCalls: 0,
  unpricedTokens: 0,
  documented: judgment(),
  documentedLifetimeSeconds: 300,
  byLifetimeSeconds: {},
  verdictDependsOnLifetime: false,
  ...overrides,
})

const steady = (entry: JudgedCacheModel): readonly (readonly JudgedCacheModel[])[] =>
  Array.from({ length: CACHE_SIGNAL_STABILITY_WINDOWS }, () => [entry])

const createFakeCacheFindingRepository = (
  seed: readonly CacheFinding[] = [],
  statusOf: (finding: CacheFinding) => CacheFindingSignalStatus = () => "open",
) => {
  const findings = new Map<string, CacheFinding>(seed.map((finding) => [finding.fingerprint, finding]))
  const repository = CacheFindingRepository.of({
    listByProject: () =>
      Effect.sync(() =>
        [...findings.values()].map((finding) => ({
          ...finding,
          signalSlug: "PRO-AAAA",
          signalStatus: statusOf(finding),
        })),
      ),
    findBySignalId: ({ signalId }) =>
      Effect.sync(() => [...findings.values()].find((finding) => finding.signalId === signalId) ?? null),
    upsert: (finding) =>
      Effect.sync(() => {
        const existing = findings.get(finding.fingerprint)
        findings.set(
          finding.fingerprint,
          existing ? { ...finding, firstObservedAt: existing.firstObservedAt } : finding,
        )
      }),
    deleteBySignalIds: ({ signalIds }) =>
      Effect.sync(() => {
        for (const [fingerprint, finding] of findings) {
          if (signalIds.includes(finding.signalId)) findings.delete(fingerprint)
        }
      }),
  })
  return { repository, findings }
}

const project: Project = {
  id: projectId,
  organizationId,
  name: "Production",
  slug: "production",
  settings: null,
  firstTraceAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null,
  lastEditedAt: new Date("2026-01-01T00:00:00.000Z"),
  linkedProjectId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

const run = (input: {
  readonly windows: readonly (readonly JudgedCacheModel[])[]
  readonly signals?: readonly Signal[]
  readonly findings?: readonly CacheFinding[]
  readonly signalStatus?: CacheFindingSignalStatus
  readonly failResolve?: boolean
}) => {
  const { repository: signalRepository, issues } = createFakeSignalRepository(
    input.signals ?? [],
    input.failResolve
      ? {
          // The lifecycle command writes through `save`; failing it is the transient
          // repository error the ordering has to survive.
          save: () => Effect.fail(new RepositoryError({ operation: "signals.save", cause: new Error("boom") })),
        }
      : undefined,
  )
  const { repository: cacheFindingRepository, findings } = createFakeCacheFindingRepository(
    input.findings ?? [],
    () => input.signalStatus ?? "open",
  )
  const events: OutboxWriteEvent[] = []

  const effect = syncCacheFindingSignalsUseCase({ organizationId, projectId, windows: input.windows, now }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(SignalRepository, signalRepository),
        Layer.succeed(CacheFindingRepository, cacheFindingRepository),
        Layer.succeed(
          OutboxEventWriter,
          OutboxEventWriter.of({ write: (event) => Effect.sync(() => void events.push(event)) }),
        ),
        Layer.succeed(
          EvaluationRepository,
          EvaluationRepository.of({
            findById: () => Effect.die("unused"),
            save: () => Effect.die("unused"),
            listByProjectId: () => Effect.die("unused"),
            listBySignalId: () => Effect.die("unused"),
            listBySignalIds: () => Effect.die("unused"),
            archive: () => Effect.die("unused"),
            unarchive: () => Effect.die("unused"),
            softDelete: () => Effect.die("unused"),
            // A cost finding never links an evaluation; reaching this would mean the
            // resolve path is stopping monitoring that does not exist.
            softDeleteBySignalId: () => Effect.die("Unexpected evaluation soft-delete on a cost signal"),
          }),
        ),
        Layer.succeed(
          ProjectRepository,
          ProjectRepository.of({
            findById: () => Effect.succeed(project),
          } as unknown as typeof ProjectRepository.Service),
        ),
        Layer.succeed(
          SettingsReader,
          SettingsReader.of({
            getProjectSettings: () => Effect.die("Unexpected project settings read"),
            getOrganizationSettings: () => Effect.die("Unexpected organization settings read"),
          }),
        ),
      ),
    ),
    Effect.provideService(SqlClient, createPassthroughSqlClient()),
  )

  return { effect, issues, findings, events }
}

const makeCostSignal = (finding: CacheFinding): Signal => ({
  id: SignalId(finding.signalId),
  organizationId,
  projectId,
  slug: "PRO-AAAA",
  name: "Prompt caching is underperforming what this traffic supports on claude-haiku-4-5",
  description: "Measured over the stability windows.",
  source: "cost",
  origin: "system",
  filters: null,
  assigneeId: null,
  priority: null,
  centroid: null,
  clusteredAt: null,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  deletedAt: null,
  createdAt: finding.createdAt,
  updatedAt: finding.updatedAt,
})

const makeFinding = (overrides: Partial<CacheFinding> = {}): CacheFinding => ({
  id: generateId(),
  organizationId,
  projectId,
  signalId: SignalId("s".repeat(24)),
  fingerprint: cacheFindingFingerprint({ provider: "anthropic", model: "claude-haiku-4-5", state: "investigate" }),
  measures: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    state: "investigate",
    urgency: "underusing",
    actualRate: 0.05,
    breakEvenRate: 0.217,
    ceilingRate: 0.86,
    modeledSavingsMicrocents: 400_000_000,
    calls: 500,
    spendMicrocents: 19_000_000_000,
    cacheLifetimeSeconds: 300,
  },
  firstObservedAt: new Date("2026-07-20T00:00:00.000Z"),
  lastObservedAt: new Date("2026-08-04T00:00:00.000Z"),
  createdAt: new Date("2026-07-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-04T00:00:00.000Z"),
  ...overrides,
})

describe("syncCacheFindingSignalsUseCase", () => {
  it("opens one signal per stable finding, on the existing SignalCreated rail", async () => {
    const { effect, issues, findings, events } = run({ windows: steady(row()) })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toHaveLength(1)
    const [signalId] = result.opened
    const signal = issues.get(signalId ?? "")
    expect(signal?.source).toBe("cost")
    expect(signal?.origin).toBe("system")
    expect(signal?.centroid).toBeNull()
    expect(signal?.name).toContain("claude-haiku-4-5")
    // `SignalCreated` is what the domain-events router fans out to agent-dispatch and to
    // the discovery notification, so the dispatch offer needs no publisher of its own.
    expect(events.map((event) => event.eventName)).toEqual(["SignalCreated"])
    expect(findings.size).toBe(1)
  })

  it("stays quiet while the same finding persists", async () => {
    const existing = makeFinding()
    const { effect, findings, events } = run({ windows: steady(row()), findings: [existing] })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toEqual([])
    expect(result.refreshed).toEqual([existing.signalId])
    expect(events).toEqual([])
    // The measures move to the current reading; the age does not, because a finding that
    // keeps being true is the same finding.
    const refreshed = findings.get(existing.fingerprint)
    expect(refreshed?.measures.actualRate).toBe(0.1)
    expect(refreshed?.firstObservedAt).toEqual(existing.firstObservedAt)
    expect(refreshed?.lastObservedAt).toEqual(now)
  })

  it("resolves a finding that has cleared, through the shared lifecycle", async () => {
    const existing = makeFinding()
    const { effect, issues, findings } = run({
      windows: steady(row({ documented: judgment({ state: "optimal", urgency: null }) })),
      signals: [makeCostSignal(existing)],
      findings: [existing],
    })
    const result = await Effect.runPromise(effect)

    expect(result.resolved).toEqual([existing.signalId])
    expect(issues.get(existing.signalId)?.resolvedAt).toEqual(now)
    expect(findings.size).toBe(0)
  })

  it("opens a new signal when the recommendation changes, rather than editing the old one", async () => {
    const existing = makeFinding()
    const { effect, findings } = run({
      windows: steady(
        row({ documented: judgment({ state: "stopCaching", urgency: "overpaying", ceilingRate: 0.05 }) }),
      ),
      signals: [makeCostSignal(existing)],
      findings: [existing],
    })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toHaveLength(1)
    expect(result.resolved).toEqual([existing.signalId])
    expect([...findings.values()].map((finding) => finding.measures.state)).toEqual(["stopCaching"])
  })

  it("never re-opens a signal a user resolved or ignored, however long the finding keeps firing", async () => {
    // The row is a tombstone. Without it, `listByProject` would hide the archived signal,
    // the finding would read as new, and a fresh signal plus a dispatch would fire on every
    // sweep — arguing daily with a decision someone already made.
    const existing = makeFinding()
    const { effect, findings, events } = run({
      windows: steady(row()),
      findings: [existing],
      signalStatus: "archived",
    })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toEqual([])
    expect(result.refreshed).toEqual([])
    expect(result.resolved).toEqual([])
    expect(result.skippedArchived).toBe(1)
    expect(events).toEqual([])
    // Untouched, so its age still reads as when the finding was first seen.
    expect(findings.get(existing.fingerprint)?.lastObservedAt).toEqual(existing.lastObservedAt)
  })

  it("stays quiet across repeated sweeps once archived, rather than firing once per run", async () => {
    const existing = makeFinding()
    for (let sweep = 0; sweep < 3; sweep++) {
      const result = await Effect.runPromise(
        run({ windows: steady(row()), findings: [existing], signalStatus: "archived" }).effect,
      )
      expect(result.opened, `sweep ${sweep}`).toEqual([])
    }
  })

  it("takes over the row of a deleted signal instead of orphaning the new one", async () => {
    // A soft-deleted signal is not a decision to suppress the finding, but its row still
    // holds the unique fingerprint — so the new signal has to claim it or go unlinked.
    const existing = makeFinding()
    const { effect, findings } = run({ windows: steady(row()), findings: [existing], signalStatus: "gone" })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toHaveLength(1)
    expect(findings.size).toBe(1)
    expect(findings.get(existing.fingerprint)?.signalId).toBe(result.opened[0])
    // Same finding, so its age survives the new signal.
    expect(findings.get(existing.fingerprint)?.firstObservedAt).toEqual(existing.firstObservedAt)
  })

  it("keeps the projection row when the resolve fails, so a later sweep can retry", async () => {
    // Deleting first would leave the signal open in the inbox with nothing left to find it
    // by. The row has to outlive a failed resolve.
    const existing = makeFinding()
    const { effect, findings, issues } = run({
      windows: steady(row({ documented: judgment({ state: "optimal", urgency: null }) })),
      signals: [makeCostSignal(existing)],
      findings: [existing],
      failResolve: true,
    })
    const result = await Effect.runPromise(effect)

    expect(result.resolved).toEqual([])
    expect(findings.has(existing.fingerprint)).toBe(true)
    expect(issues.get(existing.signalId)?.resolvedAt).toBeNull()
  })

  it("drops the row of an already-archived finding that has cleared, without resolving again", async () => {
    // The recovery path after a crash between resolve and delete: archived, not firing.
    const existing = makeFinding()
    const { effect, findings } = run({
      windows: steady(row({ documented: judgment({ state: "optimal", urgency: null }) })),
      signals: [makeCostSignal(existing)],
      findings: [existing],
      signalStatus: "archived",
    })
    const result = await Effect.runPromise(effect)

    expect(result.resolved).toEqual([])
    expect(findings.size).toBe(0)
  })

  it("opens nothing and reports the binding gate when every verdict is suppressed", async () => {
    const { effect, events } = run({
      windows: steady(row({ documented: judgment({ savingsClearsFloor: false }) })),
    })
    const result = await Effect.runPromise(effect)

    expect(result.opened).toEqual([])
    expect(result.suppressed).toEqual({ spendFloor: 1 })
    expect(events).toEqual([])
  })

  it("opens nothing before the stability requirement is met", async () => {
    const short = Array.from({ length: CACHE_SIGNAL_STABILITY_WINDOWS - 1 }, () => [row()])
    const result = await Effect.runPromise(run({ windows: short }).effect)
    expect(result).toEqual({ opened: [], refreshed: [], resolved: [], skippedArchived: 0, suppressed: {} })
  })
})
