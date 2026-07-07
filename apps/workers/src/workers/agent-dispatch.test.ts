import { DispatchAdapterError } from "@domain/agent-dispatch"
import { describe, expect, it } from "vitest"
import { finalFailureCategory } from "./agent-dispatch.ts"

describe("finalFailureCategory", () => {
  it("recovers the adapter reason from a flattened DispatchAdapterError message", () => {
    const rateLimited = new Error(new DispatchAdapterError({ reason: "rate_limited" }).message)
    const auth = new Error(new DispatchAdapterError({ reason: "auth" }).message)

    expect(finalFailureCategory(rateLimited)).toBe("rate_limited")
    expect(finalFailureCategory(auth)).toBe("auth")
  })

  it("falls back to transport for non-adapter failures", () => {
    expect(finalFailureCategory(new Error("connection refused"))).toBe("transport")
    expect(finalFailureCategory(new Error("payload parse failed"))).toBe("transport")
  })
})
