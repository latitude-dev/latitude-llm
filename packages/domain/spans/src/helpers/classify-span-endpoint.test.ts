import { describe, expect, it } from "vitest"
import { classifySpanEndpoint } from "./classify-span-endpoint.ts"

describe("classifySpanEndpoint", () => {
  it("retains every raw and classified endpoint value", () => {
    expect(
      classifySpanEndpoint({
        finishReasons: ["stop", "FUTURE_REASON"],
        errorType: "RateLimitError",
      }),
    ).toEqual({
      finishReasons: [
        { rawValue: "stop", normalizedValue: "stop", classification: "clean", kind: "normal" },
        { rawValue: "FUTURE_REASON", normalizedValue: "future_reason", classification: "unmapped" },
      ],
      providerError: {
        rawValue: "RateLimitError",
        normalizedValue: "rate_limit_error",
        classification: "providerError",
        kind: "rateLimit",
      },
    })
  })

  it("does not derive a provider error from absent error type data", () => {
    expect(classifySpanEndpoint({ finishReasons: [], errorType: "" })).toEqual({
      finishReasons: [],
      providerError: null,
    })
  })
})
