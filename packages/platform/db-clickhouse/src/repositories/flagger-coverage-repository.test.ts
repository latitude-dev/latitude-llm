import { FLAGGER_NO_REFLAG_TAG, FlaggerCoverageRepository } from "@domain/flaggers"
import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { FlaggerCoverageRepositoryLive } from "./flagger-coverage-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("x".repeat(24))
const projectId = ProjectId("p".repeat(24))
const otherProjectId = ProjectId("q".repeat(24))
const from = new Date("2026-09-01T00:00:00.000Z")
const to = new Date("2026-09-08T00:00:00.000Z")
const recordingSince = new Date("2026-09-07T10:00:00.000Z")
const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, FlaggerCoverageRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(FlaggerCoverageRepositoryLive, ch.client, organizationId)))

const sessionRow = (sessionId: string, overrides: Record<string, unknown> = {}) => ({
  organization_id: organizationId as string,
  project_id: projectId as string,
  session_id: sessionId,
  min_start_time: "2026-09-07 10:00:00.000000000",
  max_start_time: "2026-09-07 10:00:00.000000000",
  max_end_time: "2026-09-07 10:00:01.000000000",
  tokens_total: 1,
  ...overrides,
})

const decisionRow = (decisionId: string, sessionId: string, overrides: Record<string, unknown> = {}) => ({
  decision_id: decisionId.repeat(64),
  organization_id: organizationId as string,
  project_id: projectId as string,
  session_id: sessionId,
  flagger_slug: "refusal",
  analysis_hash: decisionId.repeat(64),
  scoring_artifact_version: "flagger-screening-v1",
  attempt: 1,
  version: 1,
  selected: true,
  reason: "hinted",
  inclusion_probability: 1,
  hint_kinds: [],
  outcome: null,
  created_at: "2026-09-07 10:05:00.000",
  retention_days: 90,
  ...overrides,
})

describe("FlaggerCoverageRepositoryLive", () => {
  it("reports scoped coverage, selection paths, findings, and calibration readiness", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        sessionRow("session-1"),
        sessionRow("session-2"),
        sessionRow("session-3"),
        sessionRow("session-4"),
        sessionRow("no-llm", { tokens_total: 0 }),
        sessionRow("still-active", {
          max_start_time: "2026-09-07 23:58:00.000000000",
          max_end_time: "2026-09-07 23:58:01.000000000",
        }),
        sessionRow("other-project", { project_id: otherProjectId as string }),
        sessionRow("other-organization", { organization_id: otherOrganizationId as string }),
      ],
      format: "JSONEachRow",
    })
    await ch.client.insert({
      table: "flagger_screening_decisions",
      values: [
        decisionRow("a", "session-1", { reason: "deterministic", outcome: "matched" }),
        decisionRow("b", "session-2", {
          selected: false,
          reason: "ordinary-sample",
          inclusion_probability: 0.25,
        }),
        decisionRow("c", "session-3", {
          selected: false,
          reason: "skipped",
          inclusion_probability: null,
        }),
        decisionRow("d", "session-4", {
          outcome: "matched",
          inclusion_probability: null,
        }),
        decisionRow("e", "session-1", {
          flagger_slug: "jailbreaking",
          selected: false,
          reason: "rate-limited",
          inclusion_probability: 0.1,
        }),
        decisionRow("f", "other-project", {
          project_id: otherProjectId as string,
          outcome: "matched",
        }),
        decisionRow("g", "other-organization", {
          organization_id: otherOrganizationId as string,
          outcome: "matched",
        }),
      ],
      format: "JSONEachRow",
    })

    const report = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerCoverageRepository
        return yield* repository.getProjectCoverage({ organizationId, projectId, from, to })
      }),
    )

    expect(report).toMatchObject({
      organizationId,
      projectId,
      from: recordingSince,
      to,
      recordingSince,
      eligibleSessions: 4,
      sessionsBeforeRecording: 0,
    })
    expect(report.rows).toEqual([
      {
        flaggerSlug: "jailbreaking",
        eligibleSessions: 4,
        decidedSessions: 1,
        examinedSessions: 0,
        readableSessions: 0,
        readableShare: 0,
        selectionPaths: {
          deterministic: 0,
          hinted: 0,
          uniformSample: 0,
          ordinarySample: 0,
          skipped: 0,
          rateLimited: 1,
        },
        positiveFindings: 0,
        calibrationReadyFindings: 0,
        unknownSelectionProbability: 0,
        unscreenedSessions: 3,
      },
      {
        flaggerSlug: "refusal",
        eligibleSessions: 4,
        decidedSessions: 4,
        examinedSessions: 2,
        readableSessions: 1,
        readableShare: 0.25,
        selectionPaths: {
          deterministic: 1,
          hinted: 1,
          uniformSample: 0,
          ordinarySample: 1,
          skipped: 1,
          rateLimited: 0,
        },
        positiveFindings: 2,
        calibrationReadyFindings: 1,
        unknownSelectionProbability: 1,
        unscreenedSessions: 0,
      },
    ])
  })

  it("measures coverage from the oldest screened session instead of the requested window", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [
        sessionRow("screened"),
        sessionRow("predates-screening", {
          min_start_time: "2026-09-02 10:00:00.000000000",
          max_start_time: "2026-09-02 10:00:00.000000000",
          max_end_time: "2026-09-02 10:00:01.000000000",
        }),
      ],
      format: "JSONEachRow",
    })
    await ch.client.insert({
      table: "flagger_screening_decisions",
      values: [decisionRow("a", "screened", { reason: "deterministic", outcome: "matched" })],
      format: "JSONEachRow",
    })

    const report = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerCoverageRepository
        return yield* repository.getProjectCoverage({ organizationId, projectId, from, to })
      }),
    )

    expect(report).toMatchObject({
      from: recordingSince,
      recordingSince,
      eligibleSessions: 1,
      sessionsBeforeRecording: 1,
    })
    expect(report.rows[0]).toMatchObject({ examinedSessions: 1, unscreenedSessions: 0 })
  })

  it("keeps the requested window when the project has no screening decisions", async () => {
    await ch.client.insert({ table: "sessions", values: [sessionRow("never-screened")], format: "JSONEachRow" })

    const report = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerCoverageRepository
        return yield* repository.getProjectCoverage({ organizationId, projectId, from, to })
      }),
    )

    expect(report).toMatchObject({
      from,
      recordingSince: null,
      eligibleSessions: 1,
      sessionsBeforeRecording: 0,
      rows: [],
    })
  })

  it("leaves no-reflag telemetry out of the eligible denominator", async () => {
    await ch.client.insert({
      table: "sessions",
      values: [sessionRow("screened"), sessionRow("reflag-suppressed", { tags: [FLAGGER_NO_REFLAG_TAG] })],
      format: "JSONEachRow",
    })
    await ch.client.insert({
      table: "flagger_screening_decisions",
      values: [decisionRow("a", "screened", { reason: "deterministic", outcome: "matched" })],
      format: "JSONEachRow",
    })

    const report = await run(
      Effect.gen(function* () {
        const repository = yield* FlaggerCoverageRepository
        return yield* repository.getProjectCoverage({ organizationId, projectId, from, to })
      }),
    )

    expect(report).toMatchObject({ eligibleSessions: 1, sessionsBeforeRecording: 0 })
    expect(report.rows[0]).toMatchObject({ eligibleSessions: 1, unscreenedSessions: 0 })
  })
})
