import type { z } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import { signalsModule } from "./signals.ts"

describe("listSignals query validation", () => {
  const operation = signalsModule.operations.find((candidate) => candidate.route.name === "listSignals")
  const querySchema = operation?.route.request?.query as z.ZodTypeAny

  it("rejects a whitespace-only query instead of letting it through as present", () => {
    const result = querySchema.safeParse({ query: "   " })

    expect(result.success).toBe(false)
  })

  it("trims surrounding whitespace from an otherwise valid query", () => {
    const result = querySchema.safeParse({ query: "  hello  " })

    expect(result.success).toBe(true)
    expect(result.success && (result.data as { query?: string }).query).toBe("hello")
  })

  it("still accepts a query with no whitespace at all", () => {
    const result = querySchema.safeParse({ query: "hello" })

    expect(result.success).toBe(true)
    expect(result.success && (result.data as { query?: string }).query).toBe("hello")
  })
})
