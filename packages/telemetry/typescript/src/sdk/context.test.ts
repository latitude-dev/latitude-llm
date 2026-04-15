import { context } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { beforeAll, describe, expect, it } from "vitest"
import { capture, getLatitudeContext } from "./context.ts"

describe("capture", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager())
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
})
