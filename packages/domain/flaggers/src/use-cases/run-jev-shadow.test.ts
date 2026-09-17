import { ChSqlClient, OrganizationId, RepositoryError } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { buildFlaggerSessionContext } from "../conversation.ts"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"
import type { JevShadowObservation } from "../entities/jev-shadow-observation.ts"
import { assistant, makeSessionDetail, user } from "../flagger-strategies/test-helpers.ts"
import { JevShadowDecisionProvider, type JevShadowProviderResult } from "../ports/jev-shadow-decision-provider.ts"
import { JevShadowObservationRepository } from "../ports/jev-shadow-observation-repository.ts"
import { type RunJevShadowInput, runJevShadowUseCase } from "./run-jev-shadow.ts"

const organizationId = OrganizationId("o".repeat(24))
const context = buildFlaggerSessionContext(
  makeSessionDetail([user("Please help"), assistant("I cannot help")]),
  "a".repeat(32),
)

const screeningDecision: FlaggerScreeningDecision = {
  decisionId: "d".repeat(64),
  organizationId,
  projectId: context.session.projectId,
  sessionId: context.session.sessionId,
  flaggerSlug: "frustration",
  analysisHash: "h".repeat(64),
  scoringArtifactVersion: "flagger-screening-v1",
  selected: true,
  reason: "hinted",
  inclusionProbability: 1,
  hintKinds: ["pattern:frustration"],
  retentionDays: 90,
  attempt: 2,
  version: 1,
  createdAt: new Date(),
}

const input = (overrides: Partial<RunJevShadowInput> = {}): RunJevShadowInput => ({
  organizationId,
  projectId: context.session.projectId,
  sessionId: context.session.sessionId,
  flaggerSlug: "frustration",
  enabled: true,
  screeningDecision,
  context,
  workflowId: "workflow-1",
  workflowRunId: "run-1",
  activityId: "activity-1",
  activityAttempt: 1,
  ...overrides,
})

const success = (probability: number): JevShadowProviderResult => ({
  kind: "success",
  probability,
  provider: "noul",
  requestedModel: "judge-requested",
  resolvedModel: "judge-resolved",
  latencyMs: 42,
  inputTokens: 12,
  outputTokens: 3,
})

const failure = (
  errorCategory: "timeout" | "authentication" | "rate-limit" | "malformed-response" | "provider",
): JevShadowProviderResult => ({
  kind: "failure",
  errorCategory,
  provider: "noul",
  requestedModel: "judge-requested",
  resolvedModel: null,
  latencyMs: 42,
  inputTokens: null,
  outputTokens: null,
})

const harness = (result: JevShadowProviderResult, repositoryFails = false) => {
  const observations: JevShadowObservation[] = []
  let calls = 0
  let writes = 0
  const layer = Layer.mergeAll(
    Layer.succeed(JevShadowDecisionProvider, {
      decide: () => {
        calls++
        return Effect.succeed(result)
      },
    }),
    Layer.succeed(JevShadowObservationRepository, {
      save: (observation) => {
        writes++
        return repositoryFails
          ? Effect.fail(new RepositoryError({ operation: "save", cause: new Error("unavailable") }))
          : Effect.sync(() => observations.push(observation)).pipe(Effect.asVoid)
      },
    }),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )
  return {
    calls: () => calls,
    observations,
    writes: () => writes,
    execute: (args = input()) => Effect.runPromise(runJevShadowUseCase(args).pipe(Effect.provide(layer))),
  }
}

describe("runJevShadowUseCase", () => {
  it("records both questions at the threshold boundary with complete audit metadata", async () => {
    const run = harness(success(0.5))

    await expect(run.execute()).resolves.toMatchObject({ advisoryDecision: "would-run", status: "success" })
    await expect(run.execute(input({ flaggerSlug: "refusal" }))).resolves.toMatchObject({
      advisoryDecision: "would-run",
    })

    expect(run.observations).toHaveLength(2)
    expect(run.observations[0]).toMatchObject({
      analysisHash: screeningDecision.analysisHash,
      scoringArtifactVersion: screeningDecision.scoringArtifactVersion,
      screeningAttempt: 2,
      screeningVersion: 1,
      provider: "noul",
      requestedModel: "judge-requested",
      resolvedModel: "judge-resolved",
      latencyMs: 42,
      inputTokens: 12,
      outputTokens: 3,
      selectionReason: "hinted",
      selectionProbability: 1,
      stateTruncated: false,
    })
    expect(run.observations.map((observation) => observation.questionVersion)).toEqual([
      "jev-frustration-v1",
      "jev-refusal-v1",
    ])
  })

  it("advises skip below the threshold and keeps the observation id stable across activity retries", async () => {
    const run = harness(success(0.499))

    await expect(run.execute()).resolves.toMatchObject({ advisoryDecision: "would-skip", status: "success" })
    await expect(run.execute(input({ activityAttempt: 2 }))).resolves.toMatchObject({ advisoryDecision: "would-skip" })

    expect(run.observations[0]?.observationId).toBe(run.observations[1]?.observationId)
    expect(run.observations.map((observation) => observation.activityAttempt)).toEqual([1, 2])
  })

  it.each([
    ["timeout", "timeout"],
    ["authentication", "authentication"],
    ["rate-limit", "rate-limited"],
    ["malformed-response", "malformed-response"],
    ["provider", "provider-failure"],
  ] as const)("records %s provider failure without changing baseline flow", async (category, status) => {
    const run = harness(failure(category))

    await expect(run.execute()).resolves.toMatchObject({
      advisoryDecision: "unknown",
      status,
      probability: null,
      observationSaved: true,
    })
    expect(run.observations[0]).toMatchObject({ errorCategory: category, provider: "noul", latencyMs: 42 })
  })

  it("does not call or write for disabled, unsupported, or unselected work", async () => {
    for (const args of [
      input({ enabled: false }),
      input({ flaggerSlug: "other" }),
      input({ screeningDecision: undefined }),
    ]) {
      const run = harness(success(1))
      await expect(run.execute(args)).resolves.toMatchObject({ observationSaved: false, advisoryDecision: "unknown" })
      expect(run.calls()).toBe(0)
      expect(run.writes()).toBe(0)
    }
  })

  it("does not let an audit write failure affect the advisory result", async () => {
    const run = harness(success(1), true)

    await expect(run.execute()).resolves.toMatchObject({
      advisoryDecision: "would-run",
      status: "success",
      observationSaved: false,
    })
  })

  it("runs without billing services", async () => {
    const run = harness(success(1))

    await expect(run.execute()).resolves.toMatchObject({ advisoryDecision: "would-run", observationSaved: true })
  })
})
