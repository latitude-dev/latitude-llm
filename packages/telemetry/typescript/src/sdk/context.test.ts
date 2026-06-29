import { context, SpanStatusCode, trace } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetProjectSlugDeprecationWarningForTesting } from "./_deprecation.ts"
import { capture, getLatitudeContext } from "./context.ts"

describe("capture", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
  })
  beforeEach(() => {
    resetProjectSlugDeprecationWarningForTesting()
  })
  it("should set context data for synchronous functions", () => {
    capture(
      "sync-test",
      () => {
        const ctx = context.active()
        const data = getLatitudeContext(ctx)
        expect(data?.name).toBe("sync-test")
        expect(data?.tags).toEqual(["test"])
        expect(data?.sessionId).toBe("session-1")
      },
      { tags: ["test"], sessionId: "session-1" },
    )
  })

  it("should set context data for async functions", async () => {
    await capture(
      "async-test",
      async () => {
        const ctx = context.active()
        const data = getLatitudeContext(ctx)
        expect(data?.name).toBe("async-test")
        expect(data?.tags).toEqual(["async-test"])
      },
      { tags: ["async-test"] },
    )
  })

  it("should merge tags from nested capture calls", () => {
    capture(
      "outer",
      () => {
        capture(
          "inner",
          () => {
            const ctx = context.active()
            const data = getLatitudeContext(ctx)
            expect(data?.name).toBe("inner")
            expect(data?.tags).toContain("outer")
            expect(data?.tags).toContain("inner")
            expect(data?.metadata).toEqual({ foo: "bar", baz: "qux" })
          },
          { tags: ["inner"], metadata: { baz: "qux" } },
        )
      },
      { tags: ["outer"], metadata: { foo: "bar" } },
    )
  })

  it("should deduplicate merged tags", () => {
    capture(
      "outer",
      () => {
        capture(
          "inner",
          () => {
            const ctx = context.active()
            const data = getLatitudeContext(ctx)
            expect(data?.tags).toEqual(["shared", "unique-1", "unique-2"])
          },
          { tags: ["shared", "unique-2"] },
        )
      },
      { tags: ["shared", "unique-1"] },
    )
  })

  it("propagates project from capture options onto the context", () => {
    capture(
      "scoped",
      () => {
        const ctx = context.active()
        const data = getLatitudeContext(ctx)
        expect(data?.project).toBe("call-summariser")
      },
      { project: "call-summariser" },
    )
  })

  it("nested capture without project inherits the outer one", () => {
    capture(
      "outer",
      () => {
        capture(
          "inner",
          () => {
            const ctx = context.active()
            const data = getLatitudeContext(ctx)
            expect(data?.project).toBe("primary")
          },
          { tags: ["inner"] },
        )
      },
      { project: "primary" },
    )
  })

  it("inner capture's project overrides the outer default", () => {
    capture(
      "outer",
      () => {
        capture(
          "inner",
          () => {
            const ctx = context.active()
            const data = getLatitudeContext(ctx)
            expect(data?.project).toBe("evaluation-runs")
          },
          { project: "evaluation-runs" },
        )
      },
      { project: "primary" },
    )
  })

  it("accepts the deprecated `projectSlug` option and logs a deprecation warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    capture(
      "legacy",
      () => {
        const ctx = context.active()
        const data = getLatitudeContext(ctx)
        expect(data?.project).toBe("legacy-slug")
      },
      { projectSlug: "legacy-slug" },
    )
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("`projectSlug` on capture()"))
    warnSpy.mockRestore()
  })

  it("`project` wins when both `project` and `projectSlug` are passed", () => {
    capture(
      "both",
      () => {
        const ctx = context.active()
        const data = getLatitudeContext(ctx)
        expect(data?.project).toBe("new-name")
      },
      { project: "new-name", projectSlug: "old-name" },
    )
  })

  it("should allow inner capture to override sessionId and userId", () => {
    capture(
      "outer",
      () => {
        capture(
          "inner",
          () => {
            const ctx = context.active()
            const data = getLatitudeContext(ctx)
            expect(data?.name).toBe("inner")
            expect(data?.sessionId).toBe("inner-session")
            expect(data?.userId).toBe("outer-user")
          },
          { sessionId: "inner-session" },
        )
      },
      { sessionId: "outer-session", userId: "outer-user" },
    )
  })

  it("should return function result", () => {
    const result = capture("test", () => "hello")
    expect(result).toBe("hello")
  })

  it("should return promise result for async functions", async () => {
    const result = await capture("test", async () => "async-hello")
    expect(result).toBe("async-hello")
  })

  it("should use name from options when provided", () => {
    capture("outer", () => {
      capture(
        "inner",
        () => {
          const ctx = context.active()
          const data = getLatitudeContext(ctx)
          expect(data?.name).toBe("custom-name")
        },
        { name: "custom-name" },
      )
    })
  })

  it("supports lifecycle capture with an explicit scope", () => {
    const scope = capture.start("lifecycle-test", { tags: ["lifecycle"], sessionId: "session-1" })

    const activeData = getLatitudeContext(context.active())
    expect(activeData?.name).toBe("lifecycle-test")
    expect(activeData?.tags).toEqual(["lifecycle"])
    expect(activeData?.sessionId).toBe("session-1")

    capture.end(scope)

    expect(getLatitudeContext(context.active())).toBeUndefined()
  })

  it("supports nested lifecycle capture with stack-style end", () => {
    const outer = capture.start("outer", { tags: ["outer"], metadata: { shared: "outer" } })
    capture.start("inner", { tags: ["inner"], metadata: { shared: "inner", local: "yes" } })

    const innerData = getLatitudeContext(context.active())
    expect(innerData?.name).toBe("inner")
    expect(innerData?.tags).toEqual(["outer", "inner"])
    expect(innerData?.metadata).toEqual({ shared: "inner", local: "yes" })

    capture.end()

    const outerData = getLatitudeContext(context.active())
    expect(outerData?.name).toBe("outer")
    expect(outerData?.tags).toEqual(["outer"])
    expect(outerData?.metadata).toEqual({ shared: "outer" })

    outer.end()

    expect(getLatitudeContext(context.active())).toBeUndefined()
  })
})

describe("capture error status", () => {
  const exporter = new InMemorySpanExporter()

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
    trace.setGlobalTracerProvider(new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }))
  })
  beforeEach(() => {
    exporter.reset()
  })

  it("marks the wrapper span as ERROR when the work throws", () => {
    expect(() =>
      capture("error-status", () => {
        throw new Error("boom")
      }),
    ).toThrow("boom")

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR)
    expect(spans[0]?.events.some((event) => event.name === "exception")).toBe(true)
  })

  it("marks the lifecycle span as ERROR when ended with an error", () => {
    const scope = capture.start("lifecycle-error")
    scope.end(new Error("kaboom"))

    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR)
    expect(spans[0]?.events.some((event) => event.name === "exception")).toBe(true)
  })
})
