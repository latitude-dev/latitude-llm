import { context } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import type { Span } from "@opentelemetry/sdk-trace-node"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { ATTRIBUTES } from "../constants/index.ts"
import { capture } from "./context.ts"
import { LatitudeSpanProcessor } from "./processor.ts"

const createMockSpan = () => ({
  setAttribute: vi.fn(),
  updateName: vi.fn(),
  attributes: {},
})

const createMockRootSpan = () => ({
  setAttribute: vi.fn(),
  updateName: vi.fn(),
  attributes: { "latitude.capture.root": true },
})

describe("LatitudeSpanProcessor", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  })

  const apiKey = "test-api-key"
  const projectSlug = "test-project"

  it("should throw if apiKey is empty", () => {
    expect(() => new LatitudeSpanProcessor("", projectSlug)).toThrow("apiKey is required")
  })

  it("should throw if projectSlug is empty", () => {
    expect(() => new LatitudeSpanProcessor(apiKey, "")).toThrow("projectSlug is required")
  })

  it("should stamp latitude attributes from context on span start", () => {
    const processor = new LatitudeSpanProcessor(apiKey, projectSlug)
    const mockSpan = createMockRootSpan()

    capture(
      "test-capture",
      () => {
        const ctx = context.active()
        processor.onStart(mockSpan as unknown as Span, ctx)

        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.name, "test-capture")
        expect(mockSpan.updateName).toHaveBeenCalledWith("test-capture")
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.tags, JSON.stringify(["test"]))
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.sessionId, "session-1")
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.userId, "user-1")
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.metadata, JSON.stringify({ foo: "bar" }))
      },
      { tags: ["test"], sessionId: "session-1", userId: "user-1", metadata: { foo: "bar" } },
    )
  })

  it("should not stamp attributes when no latitude context exists", () => {
    const processor = new LatitudeSpanProcessor(apiKey, projectSlug)
    const mockSpan = createMockSpan()
    const ctx = context.active()

    processor.onStart(mockSpan as unknown as Span, ctx)

    expect(mockSpan.setAttribute).not.toHaveBeenCalled()
    expect(mockSpan.updateName).not.toHaveBeenCalled()
  })

  it("should not stamp empty tags", () => {
    const processor = new LatitudeSpanProcessor(apiKey, projectSlug)
    const mockSpan = createMockSpan()

    capture(
      "test",
      () => {
        const ctx = context.active()
        processor.onStart(mockSpan as unknown as Span, ctx)

        expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(ATTRIBUTES.tags, expect.anything())
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.sessionId, "session-1")
      },
      { sessionId: "session-1" },
    )
  })

  it("should not stamp empty metadata", () => {
    const processor = new LatitudeSpanProcessor(apiKey, projectSlug)
    const mockSpan = createMockSpan()

    capture(
      "test",
      () => {
        const ctx = context.active()
        processor.onStart(mockSpan as unknown as Span, ctx)

        expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(ATTRIBUTES.metadata, expect.anything())
        expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.tags, JSON.stringify(["test"]))
      },
      { tags: ["test"] },
    )
  })

  it("should use name from options when provided", () => {
    const processor = new LatitudeSpanProcessor(apiKey, projectSlug)
    const mockSpan = createMockRootSpan()

    capture("outer", () => {
      capture(
        "inner",
        () => {
          const ctx = context.active()
          processor.onStart(mockSpan as unknown as Span, ctx)

          expect(mockSpan.setAttribute).toHaveBeenCalledWith(ATTRIBUTES.name, "custom-name")
          expect(mockSpan.updateName).toHaveBeenCalledWith("custom-name")
        },
        { name: "custom-name" },
      )
    })
  })
})
