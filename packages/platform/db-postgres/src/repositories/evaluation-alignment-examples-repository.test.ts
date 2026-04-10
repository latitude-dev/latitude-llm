import { EvaluationAlignmentExamplesRepository, type EvaluationAlignmentNegativePriority } from "@domain/evaluations"
import type { ScoreMetadata } from "@domain/scores"
import { IssueId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { EvaluationAlignmentExamplesRepositoryLive } from "./evaluation-alignment-examples-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))
const otherIssueId = IssueId("j".repeat(24))

const annotationMetadata = (rawFeedback: string): ScoreMetadata => ({
  rawFeedback,
})

const evaluationMetadata = (evaluationHash: string): ScoreMetadata => ({
  evaluationHash,
})

const customMetadata = (channel: string): ScoreMetadata => ({
  channel,
})

const makeScoreRow = (
  overrides: Partial<typeof scoresTable.$inferInsert> & {
    readonly metadata?: ScoreMetadata
  },
): typeof scoresTable.$inferInsert => {
  const source = overrides.source ?? "annotation"

  return {
    id: overrides.id ?? "s".repeat(24),
    organizationId: overrides.organizationId ?? (organizationId as string),
    projectId: overrides.projectId ?? (projectId as string),
    sessionId: overrides.sessionId ?? null,
    traceId: overrides.traceId ?? "trace-default",
    spanId: overrides.spanId ?? null,
    source,
    sourceId:
      overrides.sourceId ??
      (source === "annotation" ? "UI" : source === "evaluation" ? "v".repeat(24) : "custom-source"),
    simulationId: overrides.simulationId ?? null,
    issueId: overrides.issueId ?? null,
    value: overrides.value ?? (overrides.passed === false ? 0 : 1),
    passed: overrides.passed ?? true,
    feedback: overrides.feedback ?? "feedback",
    metadata:
      overrides.metadata ??
      (source === "annotation"
        ? annotationMetadata("feedback")
        : source === "evaluation"
          ? evaluationMetadata("hash-default")
          : customMetadata("api")),
    error: overrides.error ?? null,
    errored: overrides.errored ?? false,
    duration: overrides.duration ?? 0,
    tokens: overrides.tokens ?? 0,
    cost: overrides.cost ?? 0,
    draftedAt: overrides.draftedAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
  }
}

const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(EvaluationAlignmentExamplesRepositoryLive, database.appPostgresClient, organizationId)

describe("EvaluationAlignmentExamplesRepositoryLive", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(scoresTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("groups positive examples by trace and excludes drafted or errored evidence", async () => {
    await database.db.insert(scoresTable).values([
      makeScoreRow({
        id: "k".repeat(24),
        traceId: "trace-positive",
        sessionId: "session-positive",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("leaked token"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
      makeScoreRow({
        id: "l".repeat(24),
        traceId: "trace-positive",
        sessionId: "session-positive",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("mentioned api key"),
        createdAt: new Date("2026-04-01T00:01:00.000Z"),
      }),
      makeScoreRow({
        id: "m".repeat(24),
        traceId: "trace-draft",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        draftedAt: new Date("2026-04-01T00:02:00.000Z"),
        metadata: annotationMetadata("draft"),
      }),
      makeScoreRow({
        id: "n".repeat(24),
        traceId: "trace-errored",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        errored: true,
        error: "annotation failed",
        metadata: annotationMetadata("errored"),
      }),
    ])

    const positives = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationAlignmentExamplesRepository
        return yield* repository.listPositiveExamples({ projectId, issueId })
      }).pipe(makeProvider(database)),
    )

    expect(positives).toHaveLength(1)
    expect(positives[0]).toEqual({
      traceId: "trace-positive",
      sessionId: "session-positive",
      scoreIds: ["k".repeat(24), "l".repeat(24)],
      label: "positive",
      negativePriority: null,
      annotationFeedback: "feedback | feedback",
    })
  })

  it("normalizes empty session ids and prefers a later non-empty session id within the trace group", async () => {
    await database.db.insert(scoresTable).values([
      makeScoreRow({
        id: "a".repeat(24),
        traceId: "trace-empty-session",
        sessionId: "",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("missing session"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
      makeScoreRow({
        id: "b".repeat(24),
        traceId: "trace-prefers-non-empty",
        sessionId: "",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("first row is empty"),
        createdAt: new Date("2026-04-01T00:01:00.000Z"),
      }),
      makeScoreRow({
        id: "c".repeat(24),
        traceId: "trace-prefers-non-empty",
        sessionId: "session-present",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("later row has session"),
        createdAt: new Date("2026-04-01T00:02:00.000Z"),
      }),
    ])

    const positives = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationAlignmentExamplesRepository
        return yield* repository.listPositiveExamples({ projectId, issueId })
      }).pipe(makeProvider(database)),
    )

    expect(positives).toEqual([
      {
        traceId: "trace-empty-session",
        sessionId: null,
        scoreIds: ["a".repeat(24)],
        label: "positive",
        negativePriority: null,
        annotationFeedback: "feedback",
      },
      {
        traceId: "trace-prefers-non-empty",
        sessionId: "session-present",
        scoreIds: ["b".repeat(24), "c".repeat(24)],
        label: "positive",
        negativePriority: null,
        annotationFeedback: "feedback | feedback",
      },
    ])
  })

  it("returns negative examples in priority order and excludes traces tied to the target issue", async () => {
    await database.db.insert(scoresTable).values([
      makeScoreRow({
        id: "o".repeat(24),
        traceId: "trace-tier-1",
        sessionId: "session-tier-1",
        issueId: null,
        passed: true,
        source: "annotation",
        metadata: annotationMetadata("all good"),
        createdAt: new Date("2026-04-01T01:00:00.000Z"),
      }),
      makeScoreRow({
        id: "p".repeat(24),
        traceId: "trace-tier-2",
        sessionId: "session-tier-2",
        issueId: null,
        passed: true,
        source: "evaluation",
        metadata: evaluationMetadata("hash-tier-2"),
        createdAt: new Date("2026-04-01T01:01:00.000Z"),
      }),
      makeScoreRow({
        id: "r".repeat(24),
        traceId: "trace-tier-3",
        sessionId: "session-tier-3",
        issueId: otherIssueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("different issue"),
        createdAt: new Date("2026-04-01T01:02:00.000Z"),
      }),
      makeScoreRow({
        id: "t".repeat(24),
        traceId: "trace-target-linked",
        sessionId: "session-target-linked",
        issueId: issueId as string,
        passed: true,
        source: "annotation",
        metadata: annotationMetadata("linked to target issue"),
        createdAt: new Date("2026-04-01T01:03:00.000Z"),
      }),
      makeScoreRow({
        id: "u".repeat(24),
        traceId: "trace-excluded",
        sessionId: "session-excluded",
        issueId: null,
        passed: true,
        source: "annotation",
        metadata: annotationMetadata("exclude me"),
        createdAt: new Date("2026-04-01T01:04:00.000Z"),
      }),
    ])

    const negatives = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationAlignmentExamplesRepository
        return yield* repository.listNegativeExamples({
          projectId,
          issueId,
          excludeTraceIds: [TraceId("trace-excluded")],
        })
      }).pipe(makeProvider(database)),
    )

    expect(negatives.map((item) => [item.traceId, item.negativePriority])).toEqual([
      ["trace-tier-1", "passed-annotation-no-failures"],
      ["trace-tier-2", "no-failed-scores"],
      ["trace-tier-3", "unrelated-issue-scores"],
    ] satisfies ReadonlyArray<readonly [string, EvaluationAlignmentNegativePriority]>)
  })

  it("filters alignment examples by createdAfter when computing refresh watermarks", async () => {
    const refreshCutoff = new Date("2026-04-01T02:00:00.000Z")

    await database.db.insert(scoresTable).values([
      makeScoreRow({
        id: "v".repeat(24),
        traceId: "trace-positive-before",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("older positive"),
        createdAt: new Date("2026-04-01T01:00:00.000Z"),
      }),
      makeScoreRow({
        id: "w".repeat(24),
        traceId: "trace-positive-after",
        issueId: issueId as string,
        passed: false,
        source: "annotation",
        metadata: annotationMetadata("new positive"),
        createdAt: new Date("2026-04-01T03:00:00.000Z"),
      }),
      makeScoreRow({
        id: "x".repeat(24),
        traceId: "trace-negative-before",
        issueId: null,
        passed: true,
        source: "annotation",
        metadata: annotationMetadata("older negative"),
        createdAt: new Date("2026-04-01T01:30:00.000Z"),
      }),
      makeScoreRow({
        id: "y".repeat(24),
        traceId: "trace-negative-after",
        issueId: null,
        passed: true,
        source: "annotation",
        metadata: annotationMetadata("new negative"),
        createdAt: new Date("2026-04-01T03:30:00.000Z"),
      }),
    ])

    const { positives, negatives } = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* EvaluationAlignmentExamplesRepository

        return {
          positives: yield* repository.listPositiveExamples({
            projectId,
            issueId,
            createdAfter: refreshCutoff,
          }),
          negatives: yield* repository.listNegativeExamples({
            projectId,
            issueId,
            createdAfter: refreshCutoff,
          }),
        }
      }).pipe(makeProvider(database)),
    )

    expect(positives.map((item) => item.traceId)).toEqual(["trace-positive-after"])
    expect(negatives.map((item) => [item.traceId, item.negativePriority])).toEqual([
      ["trace-negative-after", "passed-annotation-no-failures"],
    ] satisfies ReadonlyArray<readonly [string, EvaluationAlignmentNegativePriority]>)
  })
})
