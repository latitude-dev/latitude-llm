import { describe, expect, it } from "vitest"
import { LIVE_QUEUE_COST_THRESHOLD_USD, SUPPORT_SERVICE_NAME } from "./fixtures/common.ts"
import { frustrationInFixture } from "./fixtures/frustration-in.ts"
import { toolCallErrorFixture } from "./fixtures/tool-call-error.ts"
import { warrantyEvalInFixture } from "./fixtures/warranty-eval-in.ts"
import { liveSeedFixtures } from "./fixtures.ts"
import { createSeededRng } from "./random.ts"

function totalTraceCostUsd(trace: {
  readonly spans: readonly {
    readonly type: string
    readonly usage?: { readonly totalCostUsd: number }
  }[]
}) {
  return trace.spans.reduce((sum, span) => sum + (span.type === "chat" ? (span.usage?.totalCostUsd ?? 0) : 0), 0)
}

describe("liveSeedFixtures", () => {
  for (const fixture of liveSeedFixtures) {
    it(`generates deterministic but varied cases for ${fixture.key}`, () => {
      const caseA = fixture.generateCase({
        rng: createSeededRng(`test:${fixture.key}:seed-a`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-a",
      })
      const caseARepeat = fixture.generateCase({
        rng: createSeededRng(`test:${fixture.key}:seed-a`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-a",
      })
      const caseB = fixture.generateCase({
        rng: createSeededRng(`test:${fixture.key}:seed-b`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-b",
      })

      expect(caseA).toEqual(caseARepeat)
      expect(caseA.traces.length).toBeGreaterThan(0)
      expect(caseA.traces.filter((trace) => trace.role === "target")).toHaveLength(1)
      expect(caseA.sessionId).not.toBe(caseB.sessionId)
      expect(JSON.stringify(caseA)).not.toBe(JSON.stringify(caseB))
    })

    it(`preserves core traffic traits on the target trace for ${fixture.key}`, () => {
      const generatedCase = fixture.generateCase({
        rng: createSeededRng(`trait:${fixture.key}`),
        fixtureKey: fixture.key,
        instanceIndex: 1,
        runSeed: "trait-seed",
      })
      const targetTrace = generatedCase.traces.find((trace) => trace.role === "target")

      expect(targetTrace).toBeDefined()

      if (!targetTrace) {
        return
      }

      const isSupport = targetTrace.serviceName === SUPPORT_SERVICE_NAME
      expect(targetTrace.traits?.supportService).toBe(isSupport)

      const totalCostUsd = totalTraceCostUsd(targetTrace)
      if (targetTrace.traits?.highCost) {
        expect(totalCostUsd).toBeGreaterThan(LIVE_QUEUE_COST_THRESHOLD_USD)
      } else {
        expect(totalCostUsd).toBeLessThan(LIVE_QUEUE_COST_THRESHOLD_USD)
      }
    })
  }

  it("keeps multi-turn conversational cases as separate traces in one session", () => {
    const generatedCase = warrantyEvalInFixture.generateCase({
      rng: createSeededRng("shape:warranty"),
      fixtureKey: warrantyEvalInFixture.key,
      instanceIndex: 0,
      runSeed: "shape-seed",
    })

    expect(generatedCase.traces.length).toBeGreaterThan(1)
    expect(generatedCase.traces.every((trace) => trace.spans.length === 1)).toBe(true)
    expect(generatedCase.traces.every((trace) => trace.spans[0]?.type === "chat")).toBe(true)
    expect(generatedCase.traces.map((trace) => trace.key)).toEqual(expect.arrayContaining(["opening", "follow-up"]))
  })

  it("can target the last conversational trace while keeping earlier traces as context", () => {
    const generatedCase = frustrationInFixture.generateCase({
      rng: createSeededRng("shape:frustration"),
      fixtureKey: frustrationInFixture.key,
      instanceIndex: 0,
      runSeed: "shape-seed",
    })

    const targetTrace = generatedCase.traces.find((trace) => trace.role === "target")

    expect(targetTrace?.key).toBe(generatedCase.traces[generatedCase.traces.length - 1]?.key)
    expect(generatedCase.traces.slice(0, -1).every((trace) => trace.role === "context")).toBe(true)
  })

  it("builds valid wrapper and sibling spans for tool workflows", () => {
    const generatedCase = toolCallErrorFixture.generateCase({
      rng: createSeededRng("shape:tool-call-error"),
      fixtureKey: toolCallErrorFixture.key,
      instanceIndex: 0,
      runSeed: "shape-seed",
    })
    const [trace] = generatedCase.traces

    expect(trace).toBeDefined()
    expect(trace?.spans.map((span) => span.type)).toEqual(["wrapper", "chat", "tool", "chat"])

    const wrapper = trace?.spans.find((span) => span.label === "invoke-agent")
    const childParents = trace?.spans.filter((span) => span.label !== "invoke-agent").map((span) => span.parentLabel)

    expect(wrapper?.type).toBe("wrapper")
    expect(childParents).toEqual(["invoke-agent", "invoke-agent", "invoke-agent"])
  })
})
