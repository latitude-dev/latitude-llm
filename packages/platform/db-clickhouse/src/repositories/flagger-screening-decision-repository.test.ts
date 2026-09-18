import { type FlaggerScreeningDecision, FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { type ChSqlClient, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { FlaggerScreeningDecisionRepositoryLive } from "./flagger-screening-decision-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-09-07T10:00:00.000Z")
const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, FlaggerScreeningDecisionRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(FlaggerScreeningDecisionRepositoryLive, ch.client, organizationId)))

const makeDecision = (overrides: Partial<FlaggerScreeningDecision> = {}): FlaggerScreeningDecision => ({
  decisionId: "d".repeat(64),
  organizationId,
  projectId,
  sessionId: SessionId("session-1"),
  flaggerSlug: "refusal",
  analysisHash: "a".repeat(64),
  scoringArtifactVersion: "flagger-screening-v1",
  attempt: 1,
  version: 1,
  selected: true,
  reason: "hinted",
  inclusionProbability: 1,
  hintKinds: ["pattern:refusal"],
  createdAt: now,
  retentionDays: 90,
  ...overrides,
})

describe("FlaggerScreeningDecisionRepositoryLive", () => {
  it("appends every decision field and preserves nullable values", async () => {
    await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        yield* repository.saveMany([
          makeDecision(),
          makeDecision({
            decisionId: "e".repeat(64),
            selected: false,
            reason: "ordinary-sample",
            inclusionProbability: 0.1,
            hintKinds: [],
          }),
        ])
      }),
    )

    const result = await ch.client.query({
      query: `SELECT decision_id, organization_id, project_id, session_id, flagger_slug,
        analysis_hash, scoring_artifact_version, attempt, version, selected, reason,
        inclusion_probability, hint_kinds, outcome, retention_days
        FROM flagger_screening_decisions
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
        ORDER BY decision_id`,
      query_params: { organizationId, projectId },
      format: "JSONEachRow",
    })
    const rows = await result.json<Record<string, unknown>>()

    expect(rows).toEqual([
      {
        decision_id: "d".repeat(64),
        organization_id: organizationId,
        project_id: projectId,
        session_id: "session-1",
        flagger_slug: "refusal",
        analysis_hash: "a".repeat(64),
        scoring_artifact_version: "flagger-screening-v1",
        attempt: 1,
        version: 1,
        selected: true,
        reason: "hinted",
        inclusion_probability: 1,
        hint_kinds: ["pattern:refusal"],
        outcome: null,
        retention_days: 90,
      },
      {
        decision_id: "e".repeat(64),
        organization_id: organizationId,
        project_id: projectId,
        session_id: "session-1",
        flagger_slug: "refusal",
        analysis_hash: "a".repeat(64),
        scoring_artifact_version: "flagger-screening-v1",
        attempt: 1,
        version: 1,
        selected: false,
        reason: "ordinary-sample",
        inclusion_probability: 0.1,
        hint_kinds: [],
        outcome: null,
        retention_days: 90,
      },
    ])
  })
  it("collapses revisions before selecting the newest analysis generation at the cutoff", async () => {
    const oldDecisionId = "a".repeat(64)
    const newDecisionId = "b".repeat(64)
    const at = (minute: number, second = 0) =>
      new Date(`2026-09-07T10:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`)

    await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        yield* repository.saveMany([
          makeDecision({ decisionId: oldDecisionId, analysisHash: "c".repeat(64), createdAt: at(0) }),
          makeDecision({
            decisionId: newDecisionId,
            analysisHash: "e".repeat(64),
            createdAt: at(1),
          }),
          makeDecision({
            decisionId: oldDecisionId,
            analysisHash: "c".repeat(64),
            version: 2,
            outcome: "matched",
            createdAt: at(1, 15),
          }),
          makeDecision({
            decisionId: newDecisionId,
            analysisHash: "e".repeat(64),
            version: 2,
            outcome: "error",
            createdAt: at(2),
          }),
          makeDecision({
            decisionId: newDecisionId,
            analysisHash: "e".repeat(64),
            attempt: 2,
            version: 2,
            outcome: "unmatched",
            createdAt: at(4),
          }),
        ])
      }),
    )

    const pending = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        return yield* repository.listLatestBySessions({
          organizationId,
          projectId,
          sessionIds: [SessionId("session-1")],
          cutoff: at(1, 30),
        })
      }),
    )
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ decisionId: newDecisionId, version: 1 })
    expect(pending[0]).not.toHaveProperty("outcome")

    const failed = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        return yield* repository.listLatestBySessions({
          organizationId,
          projectId,
          sessionIds: [SessionId("session-1")],
          cutoff: at(3),
        })
      }),
    )
    expect(failed[0]).toMatchObject({ decisionId: newDecisionId, attempt: 1, version: 2, outcome: "error" })

    const retried = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        return yield* repository.listLatestBySessions({
          organizationId,
          projectId,
          sessionIds: [SessionId("session-1")],
          cutoff: at(5),
        })
      }),
    )
    expect(retried[0]).toMatchObject({
      decisionId: newDecisionId,
      attempt: 2,
      version: 2,
      outcome: "unmatched",
    })
  })

  it("requires organization, project, session, and cutoff scope", async () => {
    const otherProjectId = ProjectId("q".repeat(24))
    await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        yield* repository.saveMany([
          makeDecision({ sessionId: SessionId("wanted"), outcome: "matched" }),
          makeDecision({ decisionId: "e".repeat(64), sessionId: SessionId("other-session") }),
          makeDecision({ decisionId: "f".repeat(64), projectId: otherProjectId }),
          makeDecision({ decisionId: "c".repeat(64), createdAt: new Date("2026-09-07T11:00:00.000Z") }),
        ])
      }),
    )

    const rows = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerScreeningDecisionRepository
        return yield* repository.listLatestBySessions({
          organizationId,
          projectId,
          sessionIds: [SessionId("wanted")],
          cutoff: new Date("2026-09-07T10:30:00.000Z"),
        })
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ projectId, sessionId: "wanted" })
  })
})
