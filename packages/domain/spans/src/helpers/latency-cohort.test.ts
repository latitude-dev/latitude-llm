import { describe, expect, it } from "vitest"
import {
  latencyCohortId,
  latencyInputBucket,
  latencyInputTokens,
  latencyOutputBucket,
  latencyOutputTokens,
  providerModelCohortId,
  throughputCohortId,
} from "./latency-cohort.ts"

describe("latency cohort token sides", () => {
  it("counts the whole prompt side, cache included", () => {
    expect(latencyInputTokens({ tokensInput: 100, tokensCacheRead: 900, tokensCacheCreate: 50 })).toBe(1_050)
    expect(latencyInputTokens({ tokensInput: -5, tokensCacheRead: 0, tokensCacheCreate: 0 })).toBe(0)
  })

  it("counts reasoning as generated output", () => {
    expect(latencyOutputTokens({ tokensOutput: 200, tokensReasoning: 1_000 })).toBe(1_200)
  })
})

describe("latencyInputBucket", () => {
  it("uses the boundaries the score definition fixes", () => {
    expect(latencyInputBucket(0)).toBe("under1k")
    expect(latencyInputBucket(999)).toBe("under1k")
    expect(latencyInputBucket(1_000)).toBe("from1kTo4k")
    expect(latencyInputBucket(3_999)).toBe("from1kTo4k")
    expect(latencyInputBucket(4_000)).toBe("from4kTo16k")
    expect(latencyInputBucket(15_999)).toBe("from4kTo16k")
    expect(latencyInputBucket(16_000)).toBe("from16kTo64k")
    expect(latencyInputBucket(63_999)).toBe("from16kTo64k")
    expect(latencyInputBucket(64_000)).toBe("over64k")
  })
})

describe("latencyOutputBucket", () => {
  it("separates short answers from long generations", () => {
    expect(latencyOutputBucket(0)).toBe("under256")
    expect(latencyOutputBucket(255)).toBe("under256")
    expect(latencyOutputBucket(256)).toBe("from256To1k")
    expect(latencyOutputBucket(999)).toBe("from256To1k")
    expect(latencyOutputBucket(1_000)).toBe("from1kTo4k")
    expect(latencyOutputBucket(4_000)).toBe("over4k")
  })
})

describe("cohort ids", () => {
  const key = { provider: "openai", model: "gpt-4o", inputBucket: "from1kTo4k", streaming: true } as const
  const parts = (id: string) => id.split("\u0000")

  it("separates streaming from unary and includes the output bucket only for throughput", () => {
    expect(parts(latencyCohortId(key))).toEqual(["openai", "gpt-4o", "from1kTo4k", "streaming"])
    expect(parts(latencyCohortId({ ...key, streaming: false }))).toEqual(["openai", "gpt-4o", "from1kTo4k", "unary"])
    expect(parts(throughputCohortId({ ...key, outputBucket: "over4k" }))).toEqual([
      "openai",
      "gpt-4o",
      "from1kTo4k",
      "streaming",
      "over4k",
    ])
    expect(parts(providerModelCohortId(key))).toEqual(["openai", "gpt-4o"])
  })

  it("keeps different models and buckets apart", () => {
    expect(latencyCohortId(key)).not.toBe(latencyCohortId({ ...key, model: "gpt-4o-mini" }))
    expect(latencyCohortId(key)).not.toBe(latencyCohortId({ ...key, inputBucket: "over64k" }))
    expect(latencyCohortId(key)).not.toBe(latencyCohortId({ ...key, provider: "azure" }))
  })
})
