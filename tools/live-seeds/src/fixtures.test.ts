import { describe, expect, it } from "vitest"
import { LIVE_QUEUE_COST_THRESHOLD_USD, SUPPORT_SERVICE_NAME } from "./fixtures/common.ts"
import { liveSeedFixtures } from "./fixtures.ts"
import { createSeededRng } from "./random.ts"

function totalTraceCostUsd(trace: {
  readonly spans: readonly { readonly usage: { readonly totalCostUsd: number } }[]
}) {
  return trace.spans.reduce((sum, span) => sum + span.usage.totalCostUsd, 0)
}

describe("liveSeedFixtures", () => {
  for (const fixture of liveSeedFixtures) {
    it(`generates deterministic but varied traces for ${fixture.key}`, () => {
      const traceA = fixture.generateTrace({
        rng: createSeededRng(`test:${fixture.key}:seed-a`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-a",
      })
      const traceARepeat = fixture.generateTrace({
        rng: createSeededRng(`test:${fixture.key}:seed-a`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-a",
      })
      const traceB = fixture.generateTrace({
        rng: createSeededRng(`test:${fixture.key}:seed-b`),
        fixtureKey: fixture.key,
        instanceIndex: 0,
        runSeed: "seed-b",
      })

      expect(traceA).toEqual(traceARepeat)
      expect(traceA.spans.length).toBeGreaterThan(0)
      expect(JSON.stringify(traceA.spans)).not.toBe(JSON.stringify(traceB.spans))
      expect(traceA.sessionId).not.toBe(traceB.sessionId)
    })

    it(`preserves core traffic traits for ${fixture.key}`, () => {
      const trace = fixture.generateTrace({
        rng: createSeededRng(`trait:${fixture.key}`),
        fixtureKey: fixture.key,
        instanceIndex: 1,
        runSeed: "trait-seed",
      })

      const isSupport = trace.serviceName === SUPPORT_SERVICE_NAME
      expect(trace.traits?.supportService).toBe(isSupport)

      const totalCostUsd = totalTraceCostUsd(trace)
      if (trace.traits?.highCost) {
        expect(totalCostUsd).toBeGreaterThan(LIVE_QUEUE_COST_THRESHOLD_USD)
      } else {
        expect(totalCostUsd).toBeLessThan(LIVE_QUEUE_COST_THRESHOLD_USD)
      }
    })
  }
})
