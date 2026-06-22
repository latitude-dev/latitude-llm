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

    recordSpanExceptionForDatadog(span, error)

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

  it("preserves a thrown non-Error object's own message instead of [object Object]", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = { recordException, setAttributes } as unknown as Span

    recordSpanExceptionForDatadog(span, { name: "EmailTransportError", message: "SMTP 421 service not available" })

    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ "error.message": "SMTP 421 service not available" }),
    )
    expect(recordException).toHaveBeenCalledWith(
      expect.objectContaining({ name: "EmailTransportError", message: "SMTP 421 service not available" }),
    )
  })

  it("JSON-serializes a thrown object that has no message field", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = { recordException, setAttributes } as unknown as Span

    recordSpanExceptionForDatadog(span, { code: "ECONNRESET", syscall: "read" })

    const message = setAttributes.mock.calls[0]?.[0]["error.message"]
    expect(message).not.toBe("[object Object]")
    expect(message).toContain("ECONNRESET")
    expect(message).toContain("read")
  })

  it("falls back to String() for a circular non-Error object", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = { recordException, setAttributes } as unknown as Span
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => recordSpanExceptionForDatadog(span, circular)).not.toThrow()
    expect(setAttributes).toHaveBeenCalledTimes(1)
  })

  it("records a plain string throw as the message", () => {
    const recordException = vi.fn()
    const setAttributes = vi.fn()
    const span = { recordException, setAttributes } as unknown as Span

    recordSpanExceptionForDatadog(span, "boom")

    expect(setAttributes).toHaveBeenCalledWith(expect.objectContaining({ "error.message": "boom" }))
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

    recordSpanExceptionForDatadog(span, error)

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
