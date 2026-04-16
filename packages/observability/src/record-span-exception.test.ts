import type { Span } from "@opentelemetry/api"
import { describe, expect, it, vi } from "vitest"
import { recordSpanExceptionForDatadog } from "./record-span-exception.ts"

describe("recordSpanExceptionForDatadog", () => {
  it("records a normalized web stack for Datadog sourcemaps", () => {
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

    const recordedError = recordSpanExceptionForDatadog(span, error)

    expect(recordedError).toBe(error)
    expect(error.stack).toBe(
      [
        "UnauthorizedError: Unauthorized",
        "at assertAuthenticatedSession (/app/apps/web/.output/server/_ssr/session.functions.js:11:29)",
      ].join("\n"),
    )

    expect(recordException).toHaveBeenCalledWith({
      name: "Error",
      message: "Unauthorized",
      stack: [
        "UnauthorizedError: Unauthorized",
        "at assertAuthenticatedSession (/app/apps/web/.output/server/_ssr/session.functions.js:11:29)",
      ].join("\n"),
    })
    expect(setAttributes).toHaveBeenCalledWith({
      "error.message": "Unauthorized",
      "error.stack": [
        "UnauthorizedError: Unauthorized",
        "at assertAuthenticatedSession (/app/apps/web/.output/server/_ssr/session.functions.js:11:29)",
      ].join("\n"),
      "error.type": "Error",
    })
  })

  it("leaves non-web stacks unchanged apart from file protocol removal", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = {
      recordException,
      setAttributes,
    } as unknown as Span
    const error = new Error("Boom")

    error.stack = ["Error: Boom", "at handler (file:///app/apps/workflows/dist/server.mjs:10:4)"].join("\n")

    const recordedError = recordSpanExceptionForDatadog(span, error)

    expect(recordedError).toBe(error)
    expect(error.stack).toBe(["Error: Boom", "at handler (/app/apps/workflows/dist/server.mjs:10:4)"].join("\n"))

    expect(recordException).toHaveBeenCalledWith({
      name: "Error",
      message: "Boom",
      stack: ["Error: Boom", "at handler (/app/apps/workflows/dist/server.mjs:10:4)"].join("\n"),
    })
    expect(setAttributes).toHaveBeenCalledWith({
      "error.message": "Boom",
      "error.stack": ["Error: Boom", "at handler (/app/apps/workflows/dist/server.mjs:10:4)"].join("\n"),
      "error.type": "Error",
    })
  })
})
