import type { ClickHouseClient } from "@clickhouse/client"
import { type JevShadowObservation, JevShadowObservationRepository } from "@domain/flaggers"
import { type ChSqlClient, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { JevShadowObservationRepositoryLive } from "./jev-shadow-observation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, JevShadowObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(JevShadowObservationRepositoryLive, ch.client, organizationId)))

const makeObservation = (overrides: Partial<JevShadowObservation> = {}): JevShadowObservation => ({
  observationId: "b".repeat(64),
  organizationId,
  projectId,
  sessionId: SessionId("session-1"),
  flaggerSlug: "refusal",
  screeningDecisionId: "d".repeat(64),
  analysisHash: "a".repeat(64),
  scoringArtifactVersion: "flagger-screening-v1",
  screeningAttempt: 2,
  screeningVersion: 3,
  workflowId: "workflow-id",
  workflowRunId: "workflow-run-id",
  activityId: "activity-id",
  activityAttempt: 1,
  stateHash: "f".repeat(64),
  stateBuilderVersion: "jev-shadow-state-v1",
  stateTruncated: true,
  provider: "amazon-bedrock",
  requestedModel: "requested-model",
  resolvedModel: "resolved-model",
  questionVersion: "jev-refusal-v1",
  policyVersion: "jev-shadow-policy-v1",
  threshold: 0.5,
  probability: 0.75,
  advisoryDecision: "would-run",
  status: "success",
  errorCategory: null,
  latencyMs: 123,
  inputTokens: 456,
  outputTokens: 789,
  selectionReason: "hinted",
  selectionProbability: 1,
  observedAt: new Date("2026-09-07T10:00:00.000Z"),
  retentionDays: 90,
  ...overrides,
})

describe("JevShadowObservationRepositoryLive", () => {
  it("persists every observation field", async () => {
    await run(
      Effect.gen(function* () {
        const repository = yield* JevShadowObservationRepository
        yield* repository.save(makeObservation())
      }),
    )

    const result = await ch.client.query({
      query: `SELECT observation_id, organization_id, project_id, session_id, flagger_slug, screening_decision_id,
        analysis_hash, scoring_artifact_version, screening_attempt, screening_version, workflow_id, workflow_run_id,
        activity_id, activity_attempt, state_hash, state_builder_version, state_truncated, provider, requested_model,
        resolved_model, question_version, policy_version, threshold, probability, advisory_decision, status,
        error_category, latency_ms, input_tokens, output_tokens, selection_reason, selection_probability,
        toString(observed_at) AS observed_at, retention_days
        FROM flagger_jev_shadow_observations
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: { organizationId, projectId },
      format: "JSONEachRow",
    })

    expect(await result.json()).toEqual([
      {
        observation_id: "b".repeat(64),
        organization_id: organizationId,
        project_id: projectId,
        session_id: "session-1",
        flagger_slug: "refusal",
        screening_decision_id: "d".repeat(64),
        analysis_hash: "a".repeat(64),
        scoring_artifact_version: "flagger-screening-v1",
        screening_attempt: 2,
        screening_version: 3,
        workflow_id: "workflow-id",
        workflow_run_id: "workflow-run-id",
        activity_id: "activity-id",
        activity_attempt: 1,
        state_hash: "f".repeat(64),
        state_builder_version: "jev-shadow-state-v1",
        state_truncated: true,
        provider: "amazon-bedrock",
        requested_model: "requested-model",
        resolved_model: "resolved-model",
        question_version: "jev-refusal-v1",
        policy_version: "jev-shadow-policy-v1",
        threshold: 0.5,
        probability: 0.75,
        advisory_decision: "would-run",
        status: "success",
        error_category: null,
        latency_ms: 123,
        input_tokens: 456,
        output_tokens: 789,
        selection_reason: "hinted",
        selection_probability: 1,
        observed_at: "2026-09-07 10:00:00.000",
        retention_days: 90,
      },
    ])
  })

  it("rejects cross-organization saves without writing a row", async () => {
    const otherOrganizationId = OrganizationId("x".repeat(24))
    const otherProjectId = ProjectId("y".repeat(24))
    await expect(
      run(
        Effect.gen(function* () {
          const repository = yield* JevShadowObservationRepository
          yield* repository.save(
            makeObservation({
              observationId: "c".repeat(64),
              organizationId: otherOrganizationId,
              projectId: otherProjectId,
            }),
          )
        }),
      ),
    ).rejects.toMatchObject({ _tag: "RepositoryError", operation: "JevShadowObservationRepository.save" })

    const result = await ch.client.query({
      query: `SELECT count() AS count FROM flagger_jev_shadow_observations
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: { organizationId: otherOrganizationId, projectId: otherProjectId },
      format: "JSONEachRow",
    })

    expect(await result.json()).toEqual([{ count: 0 }])
  })

  it("deduplicates Temporal retries across an observed-at month boundary", async () => {
    await run(
      Effect.gen(function* () {
        const repository = yield* JevShadowObservationRepository
        yield* repository.save(
          makeObservation({ activityAttempt: 1, observedAt: new Date("2026-01-31T23:59:59.999Z") }),
        )
        yield* repository.save(
          makeObservation({ activityAttempt: 2, observedAt: new Date("2026-02-01T00:00:00.000Z") }),
        )
      }),
    )

    const deduped = await ch.client.query({
      query: `SELECT count() AS count FROM flagger_jev_shadow_observations FINAL
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: { organizationId, projectId },
      format: "JSONEachRow",
    })

    const latest = await ch.client.query({
      query: `SELECT argMax(activity_attempt, tuple(recorded_at, activity_attempt)) AS activity_attempt
        FROM flagger_jev_shadow_observations
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
          AND observation_id = {observationId:String}`,
      query_params: { organizationId, projectId, observationId: "b".repeat(64) },
      format: "JSONEachRow",
    })

    expect(await deduped.json()).toEqual([{ count: 1 }])
    expect(await latest.json()).toEqual([{ activity_attempt: 2 }])
  })

  it("maps insert failures to the repository error", async () => {
    const failingClient = {
      insert: async () => {
        throw new Error("ClickHouse unavailable")
      },
    } as unknown as ClickHouseClient

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* JevShadowObservationRepository
          yield* repository.save(makeObservation())
        }).pipe(withClickHouse(JevShadowObservationRepositoryLive, failingClient, organizationId)),
      ),
    ).rejects.toMatchObject({ _tag: "RepositoryError", operation: "JevShadowObservationRepository.save" })
  })
})
