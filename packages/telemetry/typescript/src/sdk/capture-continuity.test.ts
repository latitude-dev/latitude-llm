import { context, createContextKey, type TracerProvider, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import type { ReadableSpan, Span } from "@opentelemetry/sdk-trace-node"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { capture, getLatitudeContext, LATITUDE_CONTEXT_KEY } from "./context.ts"
import { LatitudeSpanProcessor } from "./processor.ts"
import { isDefaultExportSpan } from "./span-filter.ts"

const TEST_CONTEXT_KEY = createContextKey("test-context-key")

describe("capture trace continuity", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  })

  describe("parent span creation", () => {
    it("should create parent span when no active trace exists", async () => {
      const capturedSpans: Span[] = []
      const originalGetTracerProvider = trace.getTracerProvider()

      const mockTracer = {
        startActiveSpan: vi.fn((name: string, options: unknown, _ctx: unknown, callback: (span: Span) => unknown) => {
          const mockSpan = {
            name,
            attributes: (options as { attributes?: Record<string, unknown> }).attributes || {},
            spanContext: () => ({
              traceId: "test-trace-id",
              spanId: `span-${capturedSpans.length}`,
              traceFlags: 1,
            }),
            end: vi.fn(),
            recordException: vi.fn(),
          } as unknown as Span

          capturedSpans.push(mockSpan)
          return callback(mockSpan)
        }),
      }

      const mockProvider = {
        getTracer: vi.fn(() => mockTracer),
      }

      trace.setGlobalTracerProvider(mockProvider as unknown as TracerProvider)

      await capture("test-capture", async () => "done", { tags: ["test"] })

      expect(capturedSpans.length).toBeGreaterThanOrEqual(1)
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        "test-capture",
        { attributes: { "latitude.capture.root": true } },
        expect.anything(),
        expect.any(Function),
      )

      trace.setGlobalTracerProvider(originalGetTracerProvider)
    })

    it("should create a new root capture span when only an external trace exists", async () => {
      const mockExistingSpan = {
        spanContext: () => ({
          traceId: "existing-trace-id",
          spanId: "existing-span-id",
          traceFlags: 1,
        }),
      }

      const getSpanSpy = vi.spyOn(trace, "getSpan").mockReturnValue(mockExistingSpan as unknown as Span)

      const mockTracer = {
        startActiveSpan: vi.fn((name: string, options: unknown, ctx: unknown, callback: (span: Span) => unknown) => {
          const mockSpan = {
            name,
            attributes: (options as { attributes?: Record<string, unknown> }).attributes || {},
            spanContext: () => ({
              traceId: "new-root-trace-id",
              spanId: "new-root-span-id",
              traceFlags: 1,
            }),
            end: vi.fn(),
            recordException: vi.fn(),
          } as unknown as Span

          expect(getLatitudeContext(ctx as Parameters<typeof getLatitudeContext>[0])?.name).toBe("nested-capture")
          expect((ctx as Parameters<typeof getLatitudeContext>[0]).getValue(TEST_CONTEXT_KEY)).toBe("test-value")
          return callback(mockSpan)
        }),
      }
      const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer as never)

      let contextWasPropagated = false

      await context.with(context.active().setValue(TEST_CONTEXT_KEY, "test-value"), () =>
        capture(
          "nested-capture",
          async () => {
            contextWasPropagated = true
            return "done"
          },
          { tags: ["nested"] },
        ),
      )

      expect(contextWasPropagated).toBe(true)
      expect(mockTracer.startActiveSpan).toHaveBeenCalledTimes(1)
      expect(mockTracer.startActiveSpan.mock.calls[0]?.[0]).toBe("nested-capture")
      expect(mockTracer.startActiveSpan.mock.calls[0]?.[1]).toEqual({ attributes: { "latitude.capture.root": true } })
      getTracerSpy.mockRestore()
      getSpanSpy.mockRestore()
    })

    it("should reuse the current trace when Latitude capture context already exists", async () => {
      const mockExistingSpan = {
        spanContext: () => ({
          traceId: "existing-latitude-trace-id",
          spanId: "existing-latitude-span-id",
          traceFlags: 1,
        }),
      }

      const getSpanSpy = vi.spyOn(trace, "getSpan").mockReturnValue(mockExistingSpan as unknown as Span)
      const mockStartActiveSpan = vi.fn()
      const getTracerSpy = vi
        .spyOn(trace, "getTracer")
        .mockReturnValue({ startActiveSpan: mockStartActiveSpan } as never)

      let contextWasPropagated = false

      await context.with(
        context.active().setValue(LATITUDE_CONTEXT_KEY, {
          name: "outer-capture",
          tags: ["outer"],
          metadata: { foo: "bar" },
          sessionId: undefined,
          userId: undefined,
        }),
        async () => {
          await capture(
            "nested-latitude-capture",
            async () => {
              contextWasPropagated = true
            },
            { tags: ["inner"] },
          )
        },
      )

      expect(contextWasPropagated).toBe(true)
      expect(mockStartActiveSpan).not.toHaveBeenCalled()
      getTracerSpy.mockRestore()
      getSpanSpy.mockRestore()
    })
  })

  describe("span naming", () => {
    it("should rename capture root span", () => {
      const mockSpan = {
        setAttribute: vi.fn(),
        updateName: vi.fn(),
        attributes: { "latitude.capture.root": true },
        spanContext: () => ({
          traceId: "test-trace-id",
          spanId: "test-span-id",
          traceFlags: 1,
        }),
      } as unknown as Span

      const processor = new LatitudeSpanProcessor("api-key", "project-slug", {})
      const testContext = context.active().setValue(LATITUDE_CONTEXT_KEY, {
        name: "my-capture-name",
        tags: undefined,
        metadata: undefined,
        sessionId: undefined,
        userId: undefined,
      })

      processor.onStart(mockSpan, testContext)

      expect(mockSpan.updateName).toHaveBeenCalledWith("my-capture-name")
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("latitude.capture.name", "my-capture-name")
    })

    it("should not rename child spans", () => {
      const mockSpan = {
        setAttribute: vi.fn(),
        updateName: vi.fn(),
        attributes: {},
        spanContext: () => ({
          traceId: "test-trace-id",
          spanId: "test-span-id",
          traceFlags: 1,
        }),
      } as unknown as Span

      const processor = new LatitudeSpanProcessor("api-key", "project-slug", {})
      const testContext = context.active().setValue(LATITUDE_CONTEXT_KEY, {
        name: "parent-capture",
        tags: undefined,
        metadata: undefined,
        sessionId: undefined,
        userId: undefined,
      })

      processor.onStart(mockSpan, testContext)

      expect(mockSpan.updateName).not.toHaveBeenCalled()
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("latitude.capture.name", "parent-capture")
    })

    it("should use options.name if provided for root", () => {
      const mockSpan = {
        setAttribute: vi.fn(),
        updateName: vi.fn(),
        attributes: { "latitude.capture.root": true },
        spanContext: () => ({
          traceId: "test-trace-id",
          spanId: "test-span-id",
          traceFlags: 1,
        }),
      } as unknown as Span

      const processor = new LatitudeSpanProcessor("api-key", "project-slug", {})
      const testContext = context.active().setValue(LATITUDE_CONTEXT_KEY, {
        name: "options-name",
        tags: undefined,
        metadata: undefined,
        sessionId: undefined,
        userId: undefined,
      })

      processor.onStart(mockSpan, testContext)
      expect(mockSpan.updateName).toHaveBeenCalledWith("options-name")
    })
  })

  describe("smart filter", () => {
    it("should allow spans with latitude.capture.root through filter", () => {
      const mockReadableSpan = {
        instrumentationScope: { name: "so.latitude.instrumentation.capture" },
        attributes: { "latitude.capture.root": true },
      } as unknown as ReadableSpan

      expect(isDefaultExportSpan(mockReadableSpan)).toBe(true)
    })

    it("should allow spans with latitude.* attributes through filter", () => {
      const mockReadableSpan = {
        instrumentationScope: { name: "some.other.tracer" },
        attributes: {
          "latitude.tags": '["test"]',
          "latitude.metadata": '{"key": "value"}',
        },
      } as unknown as ReadableSpan

      expect(isDefaultExportSpan(mockReadableSpan)).toBe(true)
    })

    it("should allow latitude scope spans through filter", () => {
      const mockReadableSpan = {
        instrumentationScope: { name: "so.latitude.instrumentation.something" },
        attributes: {},
      } as unknown as ReadableSpan

      expect(isDefaultExportSpan(mockReadableSpan)).toBe(true)
    })
  })
})
