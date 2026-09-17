import { type JevPreclassifierObservation, JevPreclassifierObservationRepository } from "@domain/flaggers"
import { type ChSqlClient, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { JevPreclassifierObservationRepositoryLive } from "./jev-preclassifier-observation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const ch = setupTestClickHouse()

const observation: JevPreclassifierObservation = {
  observationId: "b".repeat(64),
  organizationId,
  projectId,
  sessionId: SessionId("session-1"),
  flaggerSlug: "refusal",
  screeningDecisionId: "d".repeat(64),
  analysisHash: "a".repeat(64),
  workflowId: "workflow-id",
  workflowRunId: "workflow-run-id",
  activityId: "activity-id",
  activityAttempt: 1,
  stateHash: "f".repeat(64),
  stateBuilderVersion: "jev-preclassifier-state-v1",
  provider: "typesafe-ai",
  requestedModel: "jev-latest",
  resolvedModel: "jev-test",
  questionVersion: "jev-refusal-v1",
  policyVersion: "jev-preclassifier-policy-v1",
  threshold: 0.5,
  probability: 0.75,
  decision: "gated-in",
  errorCategory: null,
  latencyMs: 123,
  inputTokens: 456,
  outputTokens: 11,
  classifyAdded: true,
  selectionReason: "jev-preclassifier",
  observedAt: new Date("2026-09-07T10:00:00.000Z"),
  retentionDays: 90,
}

const run = <A, E>(effect: Effect.Effect<A, E, JevPreclassifierObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(JevPreclassifierObservationRepositoryLive, ch.client, organizationId)))

describe("JevPreclassifierObservationRepositoryLive", () => {
  it("persists preclassifier observations", async () => {
    await run(
      Effect.gen(function* () {
        const repository = yield* JevPreclassifierObservationRepository
        yield* repository.saveMany([observation])
      }),
    )

    const result = await ch.client.query({
      query: `SELECT flagger_slug, probability, decision, classify_added, selection_reason
        FROM flagger_jev_preclassifier_observations
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: { organizationId, projectId },
      format: "JSONEachRow",
    })
    expect(await result.json()).toEqual([
      {
        flagger_slug: "refusal",
        probability: 0.75,
        decision: "gated-in",
        classify_added: true,
        selection_reason: "jev-preclassifier",
      },
    ])
  })
})
