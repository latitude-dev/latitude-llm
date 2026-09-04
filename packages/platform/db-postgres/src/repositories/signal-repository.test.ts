import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { OrganizationId, ProjectId, SignalId, type SqlClient } from "@domain/shared"
import {
  CENTROID_HALF_LIFE_SECONDS,
  CENTROID_SOURCE_WEIGHTS,
  type SignalFeedback,
  SignalRepository,
  type SignalRepositoryShape,
  type SignalScoreEvidence,
} from "@domain/signals"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { projects } from "../schema/projects.ts"
import { scores } from "../schema/scores.ts"
import { signals } from "../schema/signals.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SignalRepositoryLive } from "./signal-repository.ts"

const ORG_ID = OrganizationId("org-signal-repo-test".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-signal-repo-test".padEnd(24, "x").slice(0, 24))

const WINDOW_FROM = new Date("2026-03-01T00:00:00.000Z")
const WINDOW_TO = new Date("2026-04-01T00:00:00.000Z")

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, SignalRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SignalRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const seedSignal = (input: {
  readonly id: string
  readonly slug: string
  readonly createdAt: Date
  readonly organizationId?: string
  readonly projectId?: string
  readonly resolvedAt?: Date | null
  readonly ignoredAt?: Date | null
  readonly regressedAt?: Date | null
  readonly mutedAt?: Date | null
  readonly origin?: "user" | "system"
  readonly source?: "annotation" | "flagger" | "custom"
  /** Omitted means promoted at creation, which is what every read expects to see. Null makes the row a discovered candidate, provenance included. */
  readonly promotedAt?: Date | null
  readonly deletedAt?: Date
  readonly clusteredAt?: Date
  readonly centroidEmbedding?: readonly number[]
  readonly scoreEvidence?: SignalScoreEvidence[]
}) =>
  pg.db.insert(signals).values({
    id: input.id,
    organizationId: input.organizationId ?? ORG_ID,
    projectId: input.projectId ?? PROJECT_ID,
    slug: input.slug,
    name: input.slug,
    description: `${input.slug} description`,
    source: input.source ?? (input.promotedAt === null ? "flagger" : "custom"),
    origin: input.origin ?? (input.promotedAt === null ? "system" : "user"),
    ...(input.scoreEvidence === undefined ? {} : { scoreEvidence: input.scoreEvidence }),
    resolvedAt: input.resolvedAt ?? null,
    ignoredAt: input.ignoredAt ?? null,
    regressedAt: input.regressedAt ?? null,
    mutedAt: input.mutedAt ?? null,
    promotedAt: input.promotedAt === undefined ? input.createdAt : input.promotedAt,
    deletedAt: input.deletedAt ?? null,
    ...(input.clusteredAt ? { clusteredAt: input.clusteredAt } : {}),
    // `signals_centroid_embedding_consistency_check` requires a materialized
    // embedding to be backed by a model-stamped centroid with positive mass.
    ...(input.centroidEmbedding
      ? {
          centroidEmbedding: [...input.centroidEmbedding],
          centroid: {
            base: [...input.centroidEmbedding],
            mass: 1,
            model: "voyage-4-large",
            decay: CENTROID_HALF_LIFE_SECONDS,
            weights: CENTROID_SOURCE_WEIGHTS,
          },
        }
      : {}),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })

describe("SignalRepositoryLive score evidence", () => {
  const SIGNAL = {
    id: "sig-evidence".padEnd(24, "e"),
    slug: "evidence",
    createdAt: new Date("2026-03-15T00:00:00.000Z"),
  }

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("reads the database default as diagnostic evidence", async () => {
    await seedSignal(SIGNAL)

    const signal = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).findByIdForUpdate(SignalId(SIGNAL.id))
      }),
    )

    expect(signal.scoreEvidence).toEqual([])
  })

  it("round-trips classified evidence", async () => {
    const scoreEvidence: SignalScoreEvidence[] = [
      { scoreDimension: "reliability", role: "completionOutcome" },
      { scoreDimension: "safety", role: "exposure" },
    ]
    await seedSignal({ ...SIGNAL, scoreEvidence })

    const signal = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).findByIdForUpdate(SignalId(SIGNAL.id))
      }),
    )

    expect(signal.scoreEvidence).toEqual(scoreEvidence)
  })
})

describe("SignalRepositoryLive score-evidence backfill", () => {
  const SINCE = new Date("2026-08-01T00:00:00.000Z")
  const RECENT = new Date("2026-08-15T00:00:00.000Z")
  const OLD = new Date("2026-07-15T00:00:00.000Z")
  const OTHER_ORG_ID = OrganizationId("other-org".padEnd(24, "o"))
  const OTHER_PROJECT_ID = ProjectId("other-project".padEnd(24, "p"))

  const seedOccurrence = (input: {
    readonly id: string
    readonly signalId: string
    readonly createdAt: Date
    readonly organizationId?: string
    readonly projectId?: string
    readonly draftedAt?: Date | null
  }) =>
    pg.db.insert(scores).values({
      id: input.id,
      organizationId: input.organizationId ?? ORG_ID,
      projectId: input.projectId ?? PROJECT_ID,
      signalId: input.signalId,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      value: 0,
      passed: false,
      feedback: "failure",
      metadata: { rawFeedback: "failure" },
      errored: false,
      draftedAt: input.draftedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })

  const listTargets = (
    input: { readonly organizationId?: OrganizationId; readonly projectId?: ProjectId; readonly limit?: number } = {},
  ) =>
    run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).listScoreEvidenceBackfillTargets({
          since: SINCE,
          ...input,
        })
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(scores)
    await pg.db.delete(signals)
  })

  it("finds promoted system signals with a recent published occurrence across organizations", async () => {
    const eligible = [
      { id: "backfill-open".padEnd(24, "1"), slug: "backfill-open" },
      { id: "backfill-resolved".padEnd(24, "2"), slug: "backfill-resolved", resolvedAt: RECENT },
      { id: "backfill-ignored".padEnd(24, "3"), slug: "backfill-ignored", ignoredAt: RECENT },
      { id: "backfill-muted".padEnd(24, "4"), slug: "backfill-muted", mutedAt: RECENT },
      {
        id: "backfill-new-promotion".padEnd(24, "6"),
        slug: "backfill-new-promotion",
        promotedAt: new Date("2026-08-14T00:00:00.000Z"),
      },
    ]
    for (const signal of eligible) {
      await seedSignal({ ...signal, createdAt: OLD, origin: "system", source: "flagger" })
      await seedOccurrence({ id: `score-${signal.id}`.slice(0, 24), signalId: signal.id, createdAt: RECENT })
    }

    const otherSignal = {
      id: "backfill-other-org".padEnd(24, "5"),
      slug: "backfill-other-org",
      createdAt: OLD,
      origin: "system" as const,
      source: "flagger" as const,
      organizationId: OTHER_ORG_ID,
      projectId: OTHER_PROJECT_ID,
    }
    await seedSignal(otherSignal)
    await seedOccurrence({
      id: "score-other-org".padEnd(24, "5"),
      signalId: otherSignal.id,
      createdAt: RECENT,
      organizationId: OTHER_ORG_ID,
      projectId: OTHER_PROJECT_ID,
    })

    const targets = await listTargets()

    expect(targets.map((target) => target.signalId).sort()).toEqual(
      [...eligible.map((signal) => SignalId(signal.id)), SignalId(otherSignal.id)].sort(),
    )
  })

  it("excludes ineligible signals and honors scope and limit filters", async () => {
    const candidates = [
      { id: "target-first".padEnd(24, "1"), slug: "target-first", occurrenceAt: RECENT },
      { id: "target-second".padEnd(24, "2"), slug: "target-second", occurrenceAt: RECENT },
      { id: "old-occurrence".padEnd(24, "3"), slug: "old-occurrence", occurrenceAt: OLD },
    ]
    for (const candidate of candidates) {
      await seedSignal({ ...candidate, createdAt: OLD, origin: "system", source: "flagger" })
      await seedOccurrence({
        id: `score-${candidate.id}`.slice(0, 24),
        signalId: candidate.id,
        createdAt: candidate.occurrenceAt,
      })
    }

    const userSignal = { id: "user-signal".padEnd(24, "u"), slug: "user-signal", createdAt: OLD }
    const candidateSignal = {
      id: "candidate-signal".padEnd(24, "c"),
      slug: "candidate-signal",
      createdAt: OLD,
      promotedAt: null,
    }
    const classifiedSignal = {
      id: "classified-signal".padEnd(24, "e"),
      slug: "classified-signal",
      createdAt: OLD,
      origin: "system" as const,
      source: "flagger" as const,
      scoreEvidence: [{ scoreDimension: "outcome", role: "taskOutcome" }] satisfies SignalScoreEvidence[],
    }
    await seedSignal(userSignal)
    await seedSignal(candidateSignal)
    await seedSignal(classifiedSignal)
    for (const signal of [userSignal, candidateSignal, classifiedSignal]) {
      await seedOccurrence({ id: `score-${signal.id}`.slice(0, 24), signalId: signal.id, createdAt: RECENT })
    }

    const targets = await listTargets({ organizationId: ORG_ID, projectId: PROJECT_ID, limit: 1 })

    expect(targets).toHaveLength(1)
    expect([candidates[0]?.id, candidates[1]?.id]).toContain(targets[0]?.signalId)
  })

  it("conditionally writes evidence through the organization-scoped repository", async () => {
    const signal = {
      id: "backfill-write".padEnd(24, "w"),
      slug: "backfill-write",
      createdAt: OLD,
      origin: "system" as const,
      source: "flagger" as const,
    }
    const evidence = [{ scoreDimension: "reliability", role: "operationalIncident" }] satisfies SignalScoreEvidence[]
    await seedSignal(signal)

    const applied = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).setScoreEvidenceIfEmpty({
          signalId: SignalId(signal.id),
          scoreEvidence: evidence,
          now: RECENT,
        })
      }),
    )
    const second = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).setScoreEvidenceIfEmpty({
          signalId: SignalId(signal.id),
          scoreEvidence: [{ scoreDimension: "outcome", role: "taskOutcome" }],
          now: new Date("2026-08-16T00:00:00.000Z"),
        })
      }),
    )
    const [stored] = await pg.db.select().from(signals).where(eq(signals.id, signal.id))

    expect(applied).toBe(true)
    expect(second).toBe(false)
    expect(stored?.scoreEvidence).toEqual(evidence)
    expect(stored?.updatedAt).toEqual(RECENT)
  })
})

describe("SignalRepositoryLive.listTableRows score dimension filtering", () => {
  const CREATED_AT = new Date("2026-03-15T00:00:00.000Z")
  const OUTCOME = {
    id: "sig-outcome".padEnd(24, "o"),
    slug: "outcome",
    createdAt: CREATED_AT,
    scoreEvidence: [{ scoreDimension: "outcome", role: "taskOutcome" }] satisfies SignalScoreEvidence[],
  }
  const MULTI_DIMENSION = {
    id: "sig-multi".padEnd(24, "m"),
    slug: "multi",
    createdAt: CREATED_AT,
    scoreEvidence: [
      { scoreDimension: "reliability", role: "operationalIncident" },
      { scoreDimension: "cost", role: "spendEfficiency" },
    ] satisfies SignalScoreEvidence[],
  }
  const DIAGNOSTIC = {
    id: "sig-diagnostic".padEnd(24, "d"),
    slug: "diagnostic",
    createdAt: CREATED_AT,
  }

  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(OUTCOME)
    await seedSignal(MULTI_DIMENSION)
    await seedSignal(DIAGNOSTIC)
  })

  it("matches any selected dimension and returns each signal once", async () => {
    const page = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).listTableRows({
          projectId: PROJECT_ID,
          limit: 50,
          offset: 0,
          scoreDimensions: ["outcome", "cost", "reliability"],
        })
      }),
    )

    expect(page.items.map((issue) => issue.id).sort()).toEqual([OUTCOME.id, MULTI_DIMENSION.id].sort())
    expect(page.totalCount).toBe(2)
  })

  it("does not include diagnostic signals in a dimension filter", async () => {
    const page = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).listTableRows({
          projectId: PROJECT_ID,
          limit: 50,
          offset: 0,
          scoreDimensions: ["safety"],
        })
      }),
    )

    expect(page.items).toEqual([])
    expect(page.totalCount).toBe(0)
  })
})

describe("SignalRepositoryLive.listScoringEligibleIds", () => {
  const CREATED_AT = new Date("2026-07-01T00:00:00.000Z")
  const LIFECYCLE_AT = new Date("2026-08-01T00:00:00.000Z")

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("returns promoted system signals unless they are ignored or deleted", async () => {
    const eligible: Parameters<typeof seedSignal>[0][] = [
      { id: "eligible-open".padEnd(24, "e"), slug: "eligible-open", createdAt: CREATED_AT },
      {
        id: "eligible-resolved".padEnd(24, "r"),
        slug: "eligible-resolved",
        createdAt: CREATED_AT,
        resolvedAt: LIFECYCLE_AT,
        mutedAt: LIFECYCLE_AT,
      },
    ]
    const ineligible: Parameters<typeof seedSignal>[0][] = [
      {
        id: "user-created".padEnd(24, "u"),
        slug: "user-created",
        createdAt: CREATED_AT,
        origin: "user",
      },
      {
        id: "unpromoted".padEnd(24, "p"),
        slug: "unpromoted",
        createdAt: CREATED_AT,
        promotedAt: null,
      },
      {
        id: "ignored".padEnd(24, "i"),
        slug: "ignored-scoring",
        createdAt: CREATED_AT,
        ignoredAt: LIFECYCLE_AT,
      },
      {
        id: "deleted".padEnd(24, "d"),
        slug: "deleted-scoring",
        createdAt: CREATED_AT,
        deletedAt: LIFECYCLE_AT,
      },
    ]

    for (const signal of [...eligible, ...ineligible]) {
      const origin = signal.origin ?? "system"
      await seedSignal({ ...signal, origin, source: origin === "user" ? "custom" : "flagger" })
    }

    const ids = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).listScoringEligibleIds({ projectId: PROJECT_ID })
      }),
    )

    expect([...ids].sort()).toEqual(eligible.map((signal) => signal.id).sort())
  })
})

// A signal created inside the window, and one created well before it. Neither
// has scores, so occurrence-based membership never applies.
const CREATED_IN_WINDOW = {
  id: "sig-fresh".padEnd(24, "a"),
  slug: "fresh",
  createdAt: new Date("2026-03-15T00:00:00.000Z"),
}
const CREATED_BEFORE_WINDOW = {
  id: "sig-stale".padEnd(24, "b"),
  slug: "stale",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

describe("SignalRepositoryLive.listTableRows zero-occurrence membership", () => {
  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(CREATED_IN_WINDOW)
    await seedSignal(CREATED_BEFORE_WINDOW)
  })

  it("lists a signal created in the window even with no occurrences", async () => {
    const page = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listTableRows({
          projectId: PROJECT_ID,
          limit: 50,
          offset: 0,
          timeRange: { from: WINDOW_FROM, to: WINDOW_TO },
        })
      }),
    )

    expect(page.items.map((issue) => issue.id)).toContain(CREATED_IN_WINDOW.id)
    expect(page.items.map((issue) => issue.id)).not.toContain(CREATED_BEFORE_WINDOW.id)
    expect(page.totalCount).toBe(1)
  })

  it("lists every signal when no window is applied", async () => {
    const page = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listTableRows({ projectId: PROJECT_ID, limit: 50, offset: 0 })
      }),
    )

    expect(page.totalCount).toBe(2)
    expect(page.items.map((issue) => issue.id).sort()).toEqual([CREATED_IN_WINDOW.id, CREATED_BEFORE_WINDOW.id].sort())
  })
})

describe("SignalRepositoryLive.listTableRows state sort", () => {
  const OLD = new Date("2026-01-01T00:00:00.000Z")
  const STAMP = new Date("2026-03-10T00:00:00.000Z")
  const REGRESSED = { id: "sig-regressed".padEnd(24, "r"), slug: "regressed", createdAt: OLD, regressedAt: STAMP }
  const ONGOING = { id: "sig-ongoing".padEnd(24, "o"), slug: "ongoing", createdAt: OLD }
  const RESOLVED = { id: "sig-resolved".padEnd(24, "d"), slug: "resolved", createdAt: OLD, resolvedAt: STAMP }
  const IGNORED = { id: "sig-ignored".padEnd(24, "i"), slug: "ignored", createdAt: OLD, ignoredAt: STAMP }

  const listIds = (direction: "asc" | "desc") =>
    run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        const page = yield* repo.listTableRows({
          projectId: PROJECT_ID,
          limit: 50,
          offset: 0,
          sort: { field: "state", direction },
        })
        return page.items.map((issue) => issue.id)
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(IGNORED)
    await seedSignal(RESOLVED)
    await seedSignal(ONGOING)
    await seedSignal(REGRESSED)
  })

  it("puts the most severe states first on desc, matching the analytics path", async () => {
    await expect(listIds("desc")).resolves.toEqual([REGRESSED.id, ONGOING.id, RESOLVED.id, IGNORED.id])
  })

  it("puts the least severe states first on asc", async () => {
    await expect(listIds("asc")).resolves.toEqual([IGNORED.id, RESOLVED.id, ONGOING.id, REGRESSED.id])
  })
})

describe("SignalRepositoryLive.claimReopenOnOccurrence", () => {
  const RESOLVED_AT = new Date("2026-03-10T00:00:00.000Z")
  const OCCURRED_AFTER = new Date("2026-03-20T00:00:00.000Z")
  const NOW = new Date("2026-03-20T00:00:01.000Z")
  const SIGNAL = { id: "sig-claim".padEnd(24, "c"), slug: "claim", createdAt: new Date("2026-01-01T00:00:00.000Z") }

  const claim = (occurredAt: Date) =>
    run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.claimReopenOnOccurrence({ signalId: SignalId(SIGNAL.id), occurredAt, now: NOW })
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("reopens a resolved signal exactly once per cycle", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT })

    await expect(claim(OCCURRED_AFTER)).resolves.toBe(true)

    const [row] = await pg.db.select().from(signals)
    expect(row?.resolvedAt).toBeNull()
    expect(row?.regressedAt).toEqual(NOW)

    // The next occurrence in the same cycle sees resolved_at IS NULL and loses.
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)
  })

  it("does not reopen for occurrences at or before the resolve timestamp", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT })

    await expect(claim(RESOLVED_AT)).resolves.toBe(false)
    await expect(claim(new Date("2026-03-01T00:00:00.000Z"))).resolves.toBe(false)

    const [row] = await pg.db.select().from(signals)
    expect(row?.resolvedAt).toEqual(RESOLVED_AT)
  })

  it("never reopens ignored or unresolved signals", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT, ignoredAt: RESOLVED_AT })
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)

    await pg.db.delete(signals)
    await seedSignal(SIGNAL)
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)
  })
})

describe("SignalRepositoryLive.claimFeedback", () => {
  const NOW = new Date("2026-08-17T12:00:00.000Z")
  const SIGNAL = { id: "sig-verdict".padEnd(24, "d"), slug: "verdict", createdAt: new Date("2026-01-01T00:00:00.000Z") }
  const CONFIRMED = { value: 1, passed: true, feedback: "Real problem" }

  const claim = (feedback: SignalFeedback) =>
    run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.claimFeedback({ signalId: SignalId(SIGNAL.id), feedback, now: NOW })
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("writes the verdict once and refuses every later claim", async () => {
    await seedSignal(SIGNAL)

    await expect(claim(CONFIRMED)).resolves.toBe(true)

    const [row] = await pg.db.select().from(signals)
    expect(row?.feedback).toEqual(CONFIRMED)
    expect(row?.updatedAt).toEqual(NOW)

    await expect(claim({ value: 0, passed: false, feedback: "Changed my mind" })).resolves.toBe(false)
    const [unchanged] = await pg.db.select().from(signals)
    expect(unchanged?.feedback).toEqual(CONFIRMED)
  })

  it("does not grade a soft-deleted signal", async () => {
    await seedSignal({ ...SIGNAL, deletedAt: NOW })

    await expect(claim(CONFIRMED)).resolves.toBe(false)
  })

  it("survives a save that carries a stale copy of the row", async () => {
    await seedSignal(SIGNAL)
    const stale = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.findByIdForUpdate(SignalId(SIGNAL.id))
      }),
    )

    await expect(claim(CONFIRMED)).resolves.toBe(true)
    await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        yield* repo.save({ ...stale, name: "renamed" })
      }),
    )

    const [row] = await pg.db.select().from(signals)
    expect(row?.name).toBe("renamed")
    expect(row?.feedback).toEqual(CONFIRMED)
  })
})

describe("SignalRepositoryLive.listIdsCreatedInTimeRange", () => {
  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(CREATED_IN_WINDOW)
    await seedSignal(CREATED_BEFORE_WINDOW)
  })

  it("returns only signals created inside the bounds", async () => {
    const ids = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listIdsCreatedInTimeRange({
          projectId: PROJECT_ID,
          timeRange: { from: WINDOW_FROM, to: WINDOW_TO },
        })
      }),
    )

    expect(ids).toEqual([SignalId(CREATED_IN_WINDOW.id)])
  })

  it("returns all non-deleted signals when the range is unbounded", async () => {
    const ids = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listIdsCreatedInTimeRange({ projectId: PROJECT_ID, timeRange: {} })
      }),
    )

    expect([...ids].sort()).toEqual([SignalId(CREATED_IN_WINDOW.id), SignalId(CREATED_BEFORE_WINDOW.id)].sort())
  })
})

describe("SignalRepositoryLive.countBySlug organization-wide (D15)", () => {
  const OTHER_PROJECT_ID = ProjectId("proj-other-repo-test".padEnd(24, "y").slice(0, 24))
  const seedInProject = (input: {
    readonly id: string
    readonly slug: string
    readonly projectId: ProjectId
    readonly deletedAt?: Date
  }) =>
    pg.db.insert(signals).values({
      id: input.id,
      organizationId: ORG_ID,
      projectId: input.projectId,
      slug: input.slug,
      name: input.slug,
      description: `${input.slug} description`,
      source: "custom",
      origin: "user",
      deletedAt: input.deletedAt ?? null,
      createdAt: WINDOW_FROM,
      updatedAt: WINDOW_FROM,
    })

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("counts a slug that lives in another project of the org (org-wide, not project-scoped)", async () => {
    await seedInProject({ id: "sig-b".padEnd(24, "b"), slug: "LAT-AB12", projectId: OTHER_PROJECT_ID })

    const count = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).countBySlug({ slug: "LAT-AB12" })
      }),
    )

    expect(count).toBe(1)
  })

  it("ignores soft-deleted signals (the slug is freed)", async () => {
    await seedInProject({ id: "sig-c".padEnd(24, "c"), slug: "LAT-CD34", projectId: PROJECT_ID, deletedAt: WINDOW_TO })

    const count = await run(
      Effect.gen(function* () {
        return yield* (yield* SignalRepository).countBySlug({ slug: "LAT-CD34" })
      }),
    )

    expect(count).toBe(0)
  })
})

describe("SignalRepositoryLive promotion gate", () => {
  // Same unit vector on both rows, so cosine similarity is 1 and the vector-only
  // admission path (`>= SIGNAL_DISCOVERY_MIN_VECTOR_SIMILARITY`) accepts them.
  const EMBEDDING = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => (index === 0 ? 1 : 0))
  const PROMOTED = {
    id: "sig-gate-promoted".padEnd(24, "p"),
    slug: "gate-promoted",
    createdAt: new Date("2026-03-05T00:00:00.000Z"),
    centroidEmbedding: EMBEDDING,
  }
  const CANDIDATE = {
    id: "sig-gate-candidate".padEnd(24, "n"),
    slug: "gate-candidate",
    createdAt: new Date("2026-03-06T00:00:00.000Z"),
    promotedAt: null,
    centroidEmbedding: EMBEDDING,
  }
  const ANCHOR = {
    id: "sig-gate-anchor".padEnd(24, "z"),
    slug: "gate-anchor",
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    centroidEmbedding: EMBEDDING,
  }

  const withRepo = <A, E>(f: (repo: SignalRepositoryShape) => Effect.Effect<A, E, SignalRepository | SqlClient>) =>
    run(
      Effect.gen(function* () {
        return yield* f(yield* SignalRepository)
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
    await pg.db.delete(projects)
    // `searchOrgWide` inner-joins projects, so the palette tier needs a real row.
    await pg.db
      .insert(projects)
      .values({ id: PROJECT_ID, organizationId: ORG_ID, name: "Gate project", slug: "gate-project" })
    await seedSignal(PROMOTED)
    await seedSignal(CANDIDATE)
  })

  it("omits a candidate from every user-facing read", async () => {
    const [list, tableRows, createdIds, byIds, similar, orgWide] = await Promise.all([
      withRepo((repo) => repo.list({ projectId: PROJECT_ID, limit: 50, offset: 0 })),
      withRepo((repo) => repo.listTableRows({ projectId: PROJECT_ID, limit: 50, offset: 0 })),
      withRepo((repo) => repo.listIdsCreatedInTimeRange({ projectId: PROJECT_ID, timeRange: {} })),
      withRepo((repo) =>
        repo.findByIds({ projectId: PROJECT_ID, signalIds: [SignalId(PROMOTED.id), SignalId(CANDIDATE.id)] }),
      ),
      withRepo((repo) =>
        repo.findSimilarByCentroid({ projectId: PROJECT_ID, signalId: SignalId(PROMOTED.id), limit: 25 }),
      ),
      withRepo((repo) => repo.searchOrgWide({ query: "gate", limit: 50 })),
    ])

    expect(list.items.map((issue) => issue.id)).toEqual([PROMOTED.id])
    expect(tableRows.items.map((issue) => issue.id)).toEqual([PROMOTED.id])
    expect(tableRows.totalCount).toBe(1)
    expect(createdIds).toEqual([SignalId(PROMOTED.id)])
    expect(byIds.map((issue) => issue.id)).toEqual([PROMOTED.id])
    expect(similar).toEqual([])
    expect(orgWide.map((hit) => hit.issue.id)).toEqual([PROMOTED.id])
  })

  it("resolves a candidate as not found by id and by slug", async () => {
    await expect(withRepo((repo) => repo.findById(SignalId(CANDIDATE.id)))).rejects.toThrow()
    await expect(withRepo((repo) => repo.findBySlug({ projectId: PROJECT_ID, slug: CANDIDATE.slug }))).rejects.toThrow()

    const promoted = await withRepo((repo) => repo.findById(SignalId(PROMOTED.id)))
    expect(promoted.id).toBe(PROMOTED.id)
  })

  it("hides a candidate from the list search but keeps it visible to discovery", async () => {
    const [listSearch, discovery] = await Promise.all([
      withRepo((repo) => repo.hybridSearch({ projectId: PROJECT_ID, query: "gate", normalizedEmbedding: EMBEDDING })),
      withRepo((repo) =>
        repo.hybridSearch({
          projectId: PROJECT_ID,
          query: "gate",
          normalizedEmbedding: EMBEDDING,
          includeUnpromoted: true,
        }),
      ),
    ])

    expect(listSearch.map((candidate) => candidate.signalId)).toEqual([SignalId(PROMOTED.id)])
    expect([...discovery.map((candidate) => candidate.signalId)].sort()).toEqual(
      [SignalId(PROMOTED.id), SignalId(CANDIDATE.id)].sort(),
    )
  })

  it("keeps a candidate reachable to the write and slug-uniqueness paths", async () => {
    const locked = await withRepo((repo) => repo.findByIdForUpdate(SignalId(CANDIDATE.id)))
    expect(locked.id).toBe(CANDIDATE.id)

    const [byId, count, exists] = await Promise.all([
      withRepo((repo) => repo.findById(SignalId(CANDIDATE.id), { includeUnpromoted: true })),
      withRepo((repo) => repo.countBySlug({ slug: CANDIDATE.slug })),
      withRepo((repo) => repo.existsBySlug({ projectId: PROJECT_ID, slug: CANDIDATE.slug })),
    ])

    expect(byId.id).toBe(CANDIDATE.id)
    // A candidate holds its slug for real; handing it out twice would collide
    // with `signals_unique_slug_per_org_idx`.
    expect(count).toBe(1)
    expect(exists).toBe(true)
  })

  it("keeps a soft-deleted signal hidden even from the discovery opt-in", async () => {
    const deleted = {
      id: "sig-gate-deleted".padEnd(24, "d"),
      slug: "gate-deleted",
      createdAt: new Date("2026-03-04T00:00:00.000Z"),
      promotedAt: null,
      deletedAt: new Date("2026-03-08T00:00:00.000Z"),
      centroidEmbedding: EMBEDDING,
    }
    await seedSignal(deleted)

    // `includeUnpromoted` relaxes the promotion half of the rule only. A deleted
    // signal must not come back through the door discovery uses.
    await expect(withRepo((repo) => repo.findById(SignalId(deleted.id), { includeUnpromoted: true }))).rejects.toThrow()

    const discovery = await withRepo((repo) =>
      repo.hybridSearch({
        projectId: PROJECT_ID,
        query: "gate",
        normalizedEmbedding: EMBEDDING,
        includeUnpromoted: true,
      }),
    )
    expect(discovery.map((candidate) => candidate.signalId)).not.toContain(SignalId(deleted.id))
  })

  it("returns nothing from findSimilarByCentroid when the source itself is a candidate", async () => {
    await seedSignal(ANCHOR)

    const neighbors = await withRepo((repo) =>
      repo.findSimilarByCentroid({ projectId: PROJECT_ID, signalId: SignalId(CANDIDATE.id), limit: 25 }),
    )

    expect(neighbors).toEqual([])
  })

  it("inverts findSimilarByCentroid for consolidation instead of relaxing it", async () => {
    const otherCandidate = {
      id: "sig-gate-candidate-2".padEnd(24, "m"),
      slug: "gate-candidate-2",
      createdAt: new Date("2026-03-09T00:00:00.000Z"),
      promotedAt: null,
      centroidEmbedding: EMBEDDING,
    }
    await seedSignal(otherCandidate)

    const neighbors = await withRepo((repo) =>
      repo.findSimilarByCentroid({
        projectId: PROJECT_ID,
        signalId: SignalId(CANDIDATE.id),
        limit: 25,
        unpromotedOnly: true,
      }),
    )

    // Only the other candidate: a candidate may never absorb a promoted signal,
    // and this is where that becomes a property of the read rather than a rule
    // the use case has to remember.
    expect(neighbors.map((neighbor) => neighbor.signalId)).toEqual([SignalId(otherCandidate.id)])
  })

  it("hides a soft-deleted candidate from the consolidation scan too", async () => {
    const deletedCandidate = {
      id: "sig-gate-candidate-3".padEnd(24, "k"),
      slug: "gate-candidate-3",
      createdAt: new Date("2026-03-09T00:00:00.000Z"),
      promotedAt: null,
      deletedAt: new Date("2026-03-10T00:00:00.000Z"),
      centroidEmbedding: EMBEDDING,
    }
    await seedSignal(deletedCandidate)

    const neighbors = await withRepo((repo) =>
      repo.findSimilarByCentroid({
        projectId: PROJECT_ID,
        signalId: SignalId(CANDIDATE.id),
        limit: 25,
        unpromotedOnly: true,
      }),
    )

    expect(neighbors).toEqual([])
  })
})

describe("SignalRepositoryLive merge lineage", () => {
  const NOW = new Date("2026-04-01T00:00:00.000Z")
  const CREATED = new Date("2026-03-01T00:00:00.000Z")

  const withRepo = <A, E>(f: (repo: SignalRepositoryShape) => Effect.Effect<A, E, SignalRepository | SqlClient>) =>
    run(
      Effect.gen(function* () {
        return yield* f(yield* SignalRepository)
      }),
    )

  const candidate = (id: string) => ({
    id: id.padEnd(24, "z"),
    slug: `lineage-${id}`,
    createdAt: CREATED,
    promotedAt: null,
  })

  const A = candidate("lin-a")
  const B = candidate("lin-b")
  const C = candidate("lin-c")

  beforeEach(async () => {
    await pg.db.delete(signals)
    await Promise.all([seedSignal(A), seedSignal(B), seedSignal(C)])
  })

  it("soft-deletes the absorbed candidates and points them at the survivor", async () => {
    await withRepo((repo) => repo.markMerged({ survivorId: SignalId(A.id), loserIds: [SignalId(B.id)], now: NOW }))

    const rows = await pg.db.select().from(signals).where(eq(signals.id, B.id))
    expect(rows[0]?.deletedAt).not.toBeNull()
    expect(rows[0]?.mergedIntoSignalId).toBe(A.id)
    const survivor = await pg.db.select().from(signals).where(eq(signals.id, A.id))
    expect(survivor[0]?.deletedAt).toBeNull()
  })

  it("walks a chain transitively, so a later merge sweeps what an earlier one absorbed", async () => {
    await withRepo((repo) => repo.markMerged({ survivorId: SignalId(A.id), loserIds: [SignalId(B.id)], now: NOW }))
    await withRepo((repo) => repo.markMerged({ survivorId: SignalId(C.id), loserIds: [SignalId(A.id)], now: NOW }))

    const lineage = await withRepo((repo) => repo.findAbsorbedLineage({ survivorId: SignalId(C.id), maxDepth: 10 }))

    expect([...lineage].sort()).toEqual([SignalId(A.id), SignalId(B.id)].sort())
  })

  it("stops at the depth cap instead of recursing without bound", async () => {
    await withRepo((repo) => repo.markMerged({ survivorId: SignalId(A.id), loserIds: [SignalId(B.id)], now: NOW }))
    await withRepo((repo) => repo.markMerged({ survivorId: SignalId(C.id), loserIds: [SignalId(A.id)], now: NOW }))

    const lineage = await withRepo((repo) => repo.findAbsorbedLineage({ survivorId: SignalId(C.id), maxDepth: 1 }))

    expect(lineage).toEqual([SignalId(A.id)])
  })

  it("returns nothing for a signal that absorbed nothing", async () => {
    const lineage = await withRepo((repo) => repo.findAbsorbedLineage({ survivorId: SignalId(A.id), maxDepth: 10 }))
    expect(lineage).toEqual([])
  })
})

describe("SignalRepositoryLive.expireIdleCandidates", () => {
  const NOW = new Date("2026-04-01T00:00:00.000Z")
  const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")
  const IDLE_BEFORE = new Date("2026-02-15T00:00:00.000Z")

  const withRepo = <A, E>(f: (repo: SignalRepositoryShape) => Effect.Effect<A, E, SignalRepository | SqlClient>) =>
    run(
      Effect.gen(function* () {
        return yield* f(yield* SignalRepository)
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("sweeps idle candidates and leaves everything else standing", async () => {
    const idle = { id: "sig-idle".padEnd(24, "1"), slug: "idle", createdAt: LONG_AGO, promotedAt: null }
    // Created long ago but still clustering: `clustered_at` is the anchor, so
    // this one is alive.
    const active = {
      id: "sig-active".padEnd(24, "2"),
      slug: "active",
      createdAt: LONG_AGO,
      clusteredAt: new Date("2026-03-25T00:00:00.000Z"),
      promotedAt: null,
    }
    const promoted = { id: "sig-promoted".padEnd(24, "3"), slug: "promoted-idle", createdAt: LONG_AGO }
    await Promise.all([seedSignal(idle), seedSignal(active), seedSignal(promoted)])

    const expired = await withRepo((repo) =>
      repo.expireIdleCandidates({ idleBefore: IDLE_BEFORE, now: NOW, limit: 50 }),
    )

    expect(expired).toBe(1)
    const rows = await pg.db.select().from(signals)
    const deletedIds = rows.filter((row) => row.deletedAt !== null).map((row) => row.id)
    expect(deletedIds).toEqual([idle.id])
  })

  it("respects the per-tick cap and is safe to re-run", async () => {
    await Promise.all(
      [0, 1, 2].map((index) =>
        seedSignal({
          id: `sig-batch-${index}`.padEnd(24, "9"),
          slug: `batch-${index}`,
          createdAt: LONG_AGO,
          promotedAt: null,
        }),
      ),
    )

    const first = await withRepo((repo) => repo.expireIdleCandidates({ idleBefore: IDLE_BEFORE, now: NOW, limit: 2 }))
    const second = await withRepo((repo) => repo.expireIdleCandidates({ idleBefore: IDLE_BEFORE, now: NOW, limit: 2 }))
    const third = await withRepo((repo) => repo.expireIdleCandidates({ idleBefore: IDLE_BEFORE, now: NOW, limit: 2 }))

    expect([first, second, third]).toEqual([2, 1, 0])
  })
})

describe("SignalRepositoryLive.save promotion latch", () => {
  const PROMOTED_AT = new Date("2026-03-20T10:00:00.000Z")

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  const load = async (id: string) => {
    const rows = await pg.db.select().from(signals).where(eq(signals.id, id))
    return rows[0]
  }

  it("keeps a stored promotion when a caller saves a signal it read before promotion", async () => {
    const id = "sig-latch".padEnd(24, "l")
    await pg.db.insert(signals).values({
      id,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      slug: "LAT-LTCH",
      name: "latched",
      description: "latched description",
      source: "flagger",
      origin: "system",
      promotedAt: PROMOTED_AT,
      createdAt: WINDOW_FROM,
      updatedAt: WINDOW_FROM,
    })

    const stale = await load(id)
    if (!stale) throw new Error("seed row missing")

    await run(
      Effect.gen(function* () {
        // The shape a writer that read the row before promotion would hand back.
        yield* (yield* SignalRepository).save({
          ...stale,
          promotedAt: null,
          name: "renamed by a stale writer",
        } as never)
      }),
    )

    const after = await load(id)
    expect(after?.name).toBe("renamed by a stale writer")
    expect(after?.promotedAt?.toISOString()).toBe(PROMOTED_AT.toISOString())
  })

  it("still stores the first promotion for a signal that has none", async () => {
    const id = "sig-first".padEnd(24, "f")
    await pg.db.insert(signals).values({
      id,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      slug: "LAT-FRST",
      name: "unpromoted",
      description: "unpromoted description",
      source: "flagger",
      origin: "system",
      promotedAt: null,
      createdAt: WINDOW_FROM,
      updatedAt: WINDOW_FROM,
    })

    const row = await load(id)
    if (!row) throw new Error("seed row missing")

    await run(
      Effect.gen(function* () {
        yield* (yield* SignalRepository).save({ ...row, promotedAt: PROMOTED_AT } as never)
      }),
    )

    expect((await load(id))?.promotedAt?.toISOString()).toBe(PROMOTED_AT.toISOString())
  })
})
