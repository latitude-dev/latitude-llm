import { AIMeteringScope } from "@domain/billing"
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
  const meteringCalls: unknown[] = []
  const observations: JevPreclassifierObservation[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(AIMeteringScope, {
      organizationId: OrganizationId(organizationId),
      record: (input) => Effect.sync(() => void meteringCalls.push(input)),
    }),
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
    meteringCalls,
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

  it("skips empty and ineligible sessions without provider, audit, or rate-limit calls", async () => {
    const rateLimitCalls: string[] = []
    const ineligibleDecisions: RunJevPreclassifierInput["decisions"] = [
      { slug: "frustration", action: "dropped", reason: "sampled-out", hintKinds: [] },
      { slug: "refusal", action: "dropped", reason: "sampled-out", hintKinds: [] },
      {
        slug: "nsfw",
        action: "classify",
        reason: "hinted",
        hintKinds: [],
        selection: { reason: "hinted", inclusionProbability: 1 },
      },
      { slug: "pii-leakage", action: "suppressed", suppressedBy: "test" },
      { slug: "jailbreaking", action: "matched-issue" },
      { slug: "laziness", action: "failed" },
      { slug: "incompletion", action: "dropped", reason: "missing-context" },
      { slug: "forgetting", action: "dropped", reason: "disabled" },
      { slug: "bluffing", action: "dropped", reason: "missing-flagger" },
      { slug: "task-failure", action: "dropped", reason: "rate-limited", hintKinds: [] },
      { slug: "unsupported-strategy", action: "dropped", reason: "sampled-out", hintKinds: [] },
    ]
    const input = makeInput({
      decisions: ineligibleDecisions,
      flaggerBySlug: new Map([
        ["frustration", { flaggerId: "frustration-id", slug: "frustration", enabled: false, sampling: 0 }],
        [
          "unsupported-strategy",
          { flaggerId: "unsupported-id", slug: "unsupported-strategy", enabled: true, sampling: 0 },
        ],
      ]),
      checkRateLimit: ({ flaggerSlug }) =>
        Effect.sync(() => {
          rateLimitCalls.push(flaggerSlug)
          return true
        }),
    })
    const { result, providerCalls, observations, meteringCalls } = await run(input, {
      save: () => Effect.die("audit persistence must not run"),
    })

    expect(meteringCalls).toEqual([])
    expect(result.decisions).toBe(ineligibleDecisions)
    expect(result.classifications).toBe(input.classifications)
    expect(providerCalls).toEqual([])
    expect(observations).toEqual([])
    expect(rateLimitCalls).toEqual([])

    const emptyInput = makeInput({ decisions: [], classifications: [] })
    const emptyResult = await run(emptyInput)
    expect(emptyResult.result.decisions).toBe(emptyInput.decisions)
    expect(emptyResult.result.classifications).toBe(emptyInput.classifications)
    expect(emptyResult.providerCalls).toEqual([])
    expect(emptyResult.observations).toEqual([])
  })

  it("skips sampled-out strategies with missing flaggers", async () => {
    const decisions: RunJevPreclassifierInput["decisions"] = [
      { slug: "frustration", action: "dropped", reason: "sampled-out", hintKinds: [] },
      { slug: "refusal", action: "dropped", reason: "sampled-out", hintKinds: [] },
    ]
    const { result, providerCalls, observations } = await run(
      makeInput({
        decisions,
        flaggerBySlug: new Map(),
        classifications: [],
      }),
    )
    expect(result.decisions).toBe(decisions)
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

  it("gates Safety suite members together under the shared safety-suite rate-limit bucket", async () => {
    const rateLimitCalls: string[] = []
    const { result, observations } = await run(
      makeInput({
        decisions: [
          { slug: "jailbreaking", action: "dropped", reason: "sampled-out", hintKinds: [] },
          { slug: "pii-leakage", action: "dropped", reason: "sampled-out", hintKinds: [] },
        ],
        classifications: [],
        flaggerBySlug: new Map([
          ["jailbreaking", { flaggerId: "jailbreaking-id", slug: "jailbreaking", enabled: true, sampling: 10 }],
          ["pii-leakage", { flaggerId: "pii-leakage-id", slug: "pii-leakage", enabled: true, sampling: 10 }],
        ]),
        checkRateLimit: ({ flaggerSlug }) =>
          Effect.sync(() => {
            rateLimitCalls.push(flaggerSlug)
            return true
          }),
      }),
      {
        probabilities: {
          "flagger.jailbreaking": 0.9,
          "flagger.pii-leakage": 0.8,
        },
      },
    )

    expect(rateLimitCalls).toEqual(["safety-suite"])
    expect(result.classifications).toEqual(
      expect.arrayContaining([
        { flaggerId: "jailbreaking-id", flaggerSlug: "jailbreaking", reason: "jev-preclassifier" },
        { flaggerId: "pii-leakage-id", flaggerSlug: "pii-leakage", reason: "jev-preclassifier" },
      ]),
    )
    expect(result.classifications).toHaveLength(2)
    expect(observations.find((observation) => observation.flaggerSlug === "jailbreaking")).toMatchObject({
      classifyAdded: true,
      selectionReason: "jev-preclassifier",
    })
    expect(observations.find((observation) => observation.flaggerSlug === "pii-leakage")).toMatchObject({
      classifyAdded: true,
      selectionReason: "jev-preclassifier",
    })
  })

  it("does not gate a partial Safety suite when only one member clears the Jev threshold", async () => {
    const rateLimitCalls: string[] = []
    const { result } = await run(
      makeInput({
        decisions: [
          { slug: "jailbreaking", action: "dropped", reason: "sampled-out", hintKinds: [] },
          { slug: "pii-leakage", action: "dropped", reason: "sampled-out", hintKinds: [] },
        ],
        classifications: [],
        flaggerBySlug: new Map([
          ["jailbreaking", { flaggerId: "jailbreaking-id", slug: "jailbreaking", enabled: true, sampling: 10 }],
          ["pii-leakage", { flaggerId: "pii-leakage-id", slug: "pii-leakage", enabled: true, sampling: 10 }],
        ]),
        checkRateLimit: ({ flaggerSlug }) =>
          Effect.sync(() => {
            rateLimitCalls.push(flaggerSlug)
            return true
          }),
      }),
      {
        probabilities: {
          "flagger.jailbreaking": 0.9,
          "flagger.pii-leakage": 0.1,
        },
      },
    )

    expect(rateLimitCalls).toEqual([])
    expect(result.classifications).toEqual([])
    expect(result.decisions).toEqual([
      { slug: "jailbreaking", action: "dropped", reason: "sampled-out", hintKinds: [] },
      { slug: "pii-leakage", action: "dropped", reason: "sampled-out", hintKinds: [] },
    ])
  })

  it("raises inclusionProbability to 1 for already-sampled Jev-positive decisions without duplicate classify", async () => {
    const { result, observations } = await run(
      makeInput({
        decisions: [
          {
            slug: "frustration",
            action: "classify",
            reason: "sampled",
            hintKinds: [],
            selection: { reason: "ordinary-sample", inclusionProbability: 0.1 },
          },
        ],
        classifications: [{ flaggerId: "frustration-id", flaggerSlug: "frustration", reason: "sampled" }],
        flaggerBySlug: new Map([
          ["frustration", { flaggerId: "frustration-id", slug: "frustration", enabled: true, sampling: 10 }],
        ]),
      }),
      { probabilities: { "flagger.frustration": 0.9 } },
    )

    expect(result.classifications).toEqual([
      { flaggerId: "frustration-id", flaggerSlug: "frustration", reason: "sampled" },
    ])
    expect(result.decisions[0]).toMatchObject({
      slug: "frustration",
      action: "classify",
      reason: "sampled",
      selection: { reason: "ordinary-sample", inclusionProbability: 1 },
    })
    expect(observations.find((observation) => observation.flaggerSlug === "frustration")).toMatchObject({
      decision: "gated-in",
      classifyAdded: false,
      selectionReason: "ordinary-sample",
    })
  })

  it("corrects selected decisions with inclusion probability below one and without selection", async () => {
    const decisions: RunJevPreclassifierInput["decisions"] = [
      {
        slug: "frustration",
        action: "classify",
        reason: "sampled",
        hintKinds: [],
        selection: { reason: "ordinary-sample", inclusionProbability: 0.1 },
      },
      { slug: "refusal", action: "classify", reason: "sampled", hintKinds: [] },
    ]
    const { result } = await run(
      makeInput({
        decisions,
        classifications: [
          { flaggerId: "frustration-id", flaggerSlug: "frustration", reason: "sampled" },
          { flaggerId: "refusal-id", flaggerSlug: "refusal", reason: "sampled" },
        ],
      }),
      { probabilities: { "flagger.frustration": 0.9, "flagger.refusal": 0.9 } },
    )

    expect(result.classifications).toHaveLength(2)
    expect(result.decisions[0]?.action === "classify" && result.decisions[0].selection).toEqual({
      reason: "ordinary-sample",
      inclusionProbability: 1,
    })
    expect(result.decisions[1]?.action === "classify" && result.decisions[1].selection).toEqual({
      reason: "ordinary-sample",
      inclusionProbability: 1,
    })
  })

  it("runs propensity correction when missing selection evidence is the only eligible decision", async () => {
    const classifications: RunJevPreclassifierInput["classifications"] = [
      { flaggerId: "refusal-id", flaggerSlug: "refusal", reason: "sampled" },
    ]
    const { result, providerCalls } = await run(
      makeInput({
        decisions: [{ slug: "refusal", action: "classify", reason: "sampled", hintKinds: [] }],
        classifications,
        flaggerBySlug: new Map(),
      }),
      { probabilities: { "flagger.refusal": 0.9 } },
    )

    expect(providerCalls).toHaveLength(1)
    expect(result.classifications).toEqual(classifications)
    expect(result.decisions[0]).toMatchObject({
      selection: { reason: "ordinary-sample", inclusionProbability: 1 },
    })
  })

  it("skips hinted-only classifications without selection evidence", async () => {
    const input = makeInput({
      decisions: [{ slug: "nsfw", action: "classify", reason: "hinted", hintKinds: ["pattern:nsfw"] }],
      checkRateLimit: () => Effect.die("rate limiting must not run"),
    })
    const { result, providerCalls, observations, meteringCalls } = await run(input, {
      save: () => Effect.die("audit persistence must not run"),
    })

    expect(result.decisions).toBe(input.decisions)
    expect(result.classifications).toBe(input.classifications)
    expect(providerCalls).toEqual([])
    expect(observations).toEqual([])
    expect(meteringCalls).toEqual([])
  })

  it("corrects hinted classifications with explicit probability below one", async () => {
    const { result, providerCalls } = await run(
      makeInput({
        decisions: [
          {
            slug: "nsfw",
            action: "classify",
            reason: "hinted",
            hintKinds: ["pattern:nsfw"],
            selection: { reason: "hinted", inclusionProbability: 0.5 },
          },
        ],
        classifications: [{ flaggerId: "nsfw-id", flaggerSlug: "nsfw", reason: "hinted" }],
      }),
      { probabilities: { "flagger.nsfw": 0.9 } },
    )

    expect(providerCalls).toHaveLength(1)
    expect(result.classifications).toEqual([{ flaggerId: "nsfw-id", flaggerSlug: "nsfw", reason: "hinted" }])
    expect(result.decisions[0]).toMatchObject({
      selection: { reason: "hinted", inclusionProbability: 1 },
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
