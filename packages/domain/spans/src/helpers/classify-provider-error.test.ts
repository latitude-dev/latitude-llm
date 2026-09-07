import { describe, expect, it } from "vitest"
import { classifyProviderError, normalizeProviderErrorType } from "./classify-provider-error.ts"

describe("classifyProviderError", () => {
  it.each([
    ["RateLimitError", "rateLimit"],
    ["RESOURCE_EXHAUSTED", "rateLimit"],
    ["openai.RateLimitError", "rateLimit"],
    ["OverloadedError", "overload"],
    ["anthropic.overloaded_error", "overload"],
    ["InternalServerError", "serviceFailure"],
    ["APIConnectionError", "serviceFailure"],
    ["ServiceUnavailable", "serviceFailure"],
    ["AuthenticationError", "providerRejection"],
    ["PermissionDeniedError", "providerRejection"],
    ["InvalidRequestError", "providerRejection"],
  ] as const)("maps named provider error %s to %s", (rawValue, kind) => {
    expect(classifyProviderError(rawValue)).toMatchObject({ classification: "providerError", kind })
  })

  it.each([
    "Error",
    "APIError",
    "ToolExecutionError",
    "BookingUnavailableError",
  ])("keeps generic or non-provider error %s unmapped", (rawValue) => {
    expect(classifyProviderError(rawValue)).toMatchObject({ classification: "unmapped", rawValue })
  })

  it("returns no observation when no named error type was captured", () => {
    expect(classifyProviderError("  ")).toBeNull()
  })

  it("normalizes class names and namespaces without losing the raw value", () => {
    expect(normalizeProviderErrorType(" openai.APIConnectionError ")).toBe("openai_api_connection_error")
  })
})
