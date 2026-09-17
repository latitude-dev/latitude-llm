import { ChSqlClient, OrganizationId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { buildFlaggerSessionContext } from "../conversation.ts"
import type { JevPreclassifierObservation } from "../entities/jev-preclassifier-observation.ts"
import { assistant, makeSessionDetail, user } from "../flagger-strategies/test-helpers.ts"
import { JevPreclassifierObservationRepository } from "../ports/jev-preclassifier-observation-repository.ts"
import { JevShadowDecisionProvider } from "../ports/jev-shadow-decision-provider.ts"
import { type RunJevPreclassifierInput, runJevPreclassifierUseCase } from "./run-jev-preclassifier.ts"

const organizationId = "a".repeat(24)
const projectId = "b".repeat(24)
const analysisHash = "d".repeat(64)
const context = buildFlaggerSessionContext(
  makeSessionDetail([user("Please help."), assistant("Here is the result.")]),
  "c".repeat(32),
)

const baselineDecisions: RunJevPreclassifierInput["decisions"] = [
  { slug: "frustration", action: "dropped", reason: "sampled-out", hintKinds: [] },
  { slug: "refusal", action: "dropped", reason: "sampled-out", hintKinds: [] },
  { slug: "nsfw", action: "classify", reason: "hinted", hintKinds: ["pattern:nsfw"] },
]

const makeInput = (overrides: Partial<RunJevPreclassifierInput> = {}): RunJevPreclassifierInput => ({
  enabled: true,
  organizationId,
  projectId,
  sessionId: "session-1",
  analysisHash,
  context,
  decisions: baselineDecisions,
  classifications: [{ flaggerId: "nsfw-id", flaggerSlug: "nsfw", reason: "hinted" }],
  flaggerBySlug: new Map([
    ["frustration", { flaggerId: "frustration-id", slug: "frustration", enabled: true, sampling: 0 }],
    ["refusal", { flaggerId: "refusal-id", slug: "refusal", enabled: true, sampling: 0 }],
    ["nsfw", { flaggerId: "nsfw-id", slug: "nsfw", enabled: true, sampling: 0 }],
  ]),
  hasPositiveHints: false,
  checkRateLimit: () => Effect.succeed(true),
  workflowId: "workflow-id",
  workflowRunId: "workflow-run-id",
  activityId: "activity-id",
  activityAttempt: 1,
  ...overrides,
})

const run = (
  input: RunJevPreclassifierInput,
  options: {
    readonly probabilities?: Readonly<Record<string, number>>
    readonly save?: (observations: readonly JevPreclassifierObservation[]) => Effect.Effect<void>
  } = {},
) => {
  const providerCalls: string[][] = []
  const observations: JevPreclassifierObservation[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(JevShadowDecisionProvider, {
      decide: () => Effect.die("single-question path must not run"),
      decideMany: ({ questions }) =>
        Effect.sync(() => {
          providerCalls.push(questions.map((question) => question.id))
          return Object.fromEntries(
            questions.map((question) => {
              const probability = options.probabilities?.[question.id]
              return [
                question.id,
                probability === undefined
                  ? {
                      kind: "failure" as const,
                      errorCategory: "malformed-response" as const,
                      provider: "typesafe-ai",
                      requestedModel: "jev-latest",
                      resolvedModel: "jev-test",
                      latencyMs: 12,
                      inputTokens: 30,
                      outputTokens: 3,
                    }
                  : {
                      kind: "success" as const,
                      probability,
                      provider: "typesafe-ai",
                      requestedModel: "jev-latest",
                      resolvedModel: "jev-test",
                      latencyMs: 12,
                      inputTokens: 30,
                      outputTokens: 3,
                    },
              ]
            }),
          )
        }),
    }),
    Layer.succeed(JevPreclassifierObservationRepository, {
      saveMany: options.save ?? ((saved) => Effect.sync(() => void observations.push(...saved))),
    }),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
  )

  return Effect.runPromise(runJevPreclassifierUseCase(input).pipe(Effect.provide(layer))).then((result) => ({
    result,
    providerCalls,
    observations,
  }))
}

describe("runJevPreclassifierUseCase", () => {
  it("does nothing unless explicitly enabled", async () => {
    const { result, providerCalls, observations } = await run(makeInput({ enabled: false }))

    expect(result.decisions).toBe(baselineDecisions)
    expect(result.classifications).toEqual([{ flaggerId: "nsfw-id", flaggerSlug: "nsfw", reason: "hinted" }])
    expect(providerCalls).toEqual([])
    expect(observations).toEqual([])
  })

  it("batches all dimensions, gates sampled-out flaggers, and records partial failures", async () => {
    const rateLimitCalls: string[] = []
    const { result, providerCalls, observations } = await run(
      makeInput({
        checkRateLimit: ({ flaggerSlug }) =>
          Effect.sync(() => {
            rateLimitCalls.push(flaggerSlug)
            return true
          }),
      }),
      { probabilities: { "flagger.frustration": 0.8, "flagger.refusal": 0.2, "flagger.nsfw": 0.9 } },
    )

    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0]).toContain("flagger.task-failure")
    expect(result.classifications).toContainEqual({
      flaggerId: "frustration-id",
      flaggerSlug: "frustration",
      reason: "jev-preclassifier",
    })
    expect(result.classifications).toContainEqual({ flaggerId: "nsfw-id", flaggerSlug: "nsfw", reason: "hinted" })
    expect(rateLimitCalls).toEqual(["frustration"])
    expect(observations.find((observation) => observation.flaggerSlug === "frustration")).toMatchObject({
      decision: "gated-in",
      classifyAdded: true,
      selectionReason: "jev-preclassifier",
    })
    expect(observations.find((observation) => observation.flaggerSlug === "refusal")).toMatchObject({
      decision: "below-threshold",
      classifyAdded: false,
    })
    expect(observations.find((observation) => observation.flaggerSlug === "nsfw")).toMatchObject({
      decision: "gated-in",
      classifyAdded: false,
      selectionReason: "hinted",
    })
  })

  it("does not return gated classifications when audit persistence fails", async () => {
    await expect(
      run(makeInput(), {
        probabilities: { "flagger.frustration": 0.8 },
        save: () => Effect.die("audit failed"),
      }),
    ).rejects.toThrow("audit failed")
  })
})
