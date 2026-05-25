import { describe, expect, it } from "vitest"
import { jsonSchemaToZod } from "./json-schema.ts"

describe("jsonSchemaToZod", () => {
  it("honors boolean enum constraints", () => {
    const schema = jsonSchemaToZod({ type: "boolean", enum: [true] })

    expect(schema.parse(true)).toBe(true)
    expect(schema.safeParse(false).success).toBe(false)
  })

  it("treats empty boolean enums as never", () => {
    const schema = jsonSchemaToZod({ type: "boolean", enum: [] })

    expect(schema.safeParse(true).success).toBe(false)
    expect(schema.safeParse(false).success).toBe(false)
  })
})
