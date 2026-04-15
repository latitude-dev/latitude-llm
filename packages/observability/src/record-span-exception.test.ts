import type { Span } from "@opentelemetry/api"
import { describe, expect, it, vi } from "vitest"
import { recordSpanExceptionForDatadog } from "./record-span-exception.ts"

describe("recordSpanExceptionForDatadog", () => {
  it("records a normalized stack for Datadog sourcemaps", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = {
      recordException,
      setAttributes,
    } as unknown as Span
    const error = new Error("Unauthorized")

    error.stack = [
      "UnauthorizedError: Unauthorized",
      "at assertAuthenticatedSession (file:///app/apps/web/.output/server/_ssr/session.functions.mjs:11:29)",
    ].join("\n")

    recordSpanExceptionForDatadog(span, error)

    expect(recordException).toHaveBeenCalledWith({
      name: "Error",
      message: "Unauthorized",
      stack: [
        "UnauthorizedError: Unauthorized",
        "at assertAuthenticatedSession (/app/apps/web/.output/server/_ssr/session.functions.mjs:11:29)",
      ].join("\n"),
    })
    expect(setAttributes).toHaveBeenCalledWith({
      "error.message": "Unauthorized",
      "error.stack": [
        "UnauthorizedError: Unauthorized",
        "at assertAuthenticatedSession (/app/apps/web/.output/server/_ssr/session.functions.mjs:11:29)",
      ].join("\n"),
      "error.type": "Error",
    })
  })
})
