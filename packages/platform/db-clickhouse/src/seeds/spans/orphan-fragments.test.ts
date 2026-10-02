import {
  LAUNCH_LATENCY_REFERENCE_ARTIFACT,
  lookupThroughputExpectationTps,
  lookupTtftExpectationNs,
} from "@domain/agent-score"
import { bootstrapSeedScope } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { buildAllOrphanFragmentSpans } from "./orphan-fragments.ts"

describe("orphan fragment demo fixtures", () => {
  it("provides latency references for every streaming generation in the benchmark project", () => {
    const generations = buildAllOrphanFragmentSpans(bootstrapSeedScope).filter((span) => span.is_streaming === 1)

    expect(generations).toHaveLength(3)
    for (const span of generations) {
      const input = {
        artifact: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
        provider: span.provider,
        model: span.model,
        inputTokens: span.tokens_input,
        outputTokens: span.tokens_output,
        isStreaming: true,
      }
      expect(lookupTtftExpectationNs(input).provenance).not.toBe("unmeasured")
      expect(lookupThroughputExpectationTps(input).provenance).not.toBe("unmeasured")
    }
  })
})
