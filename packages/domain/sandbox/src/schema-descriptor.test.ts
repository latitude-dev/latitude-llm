import { describe, expect, it } from "vitest"
import { isScoreMatch, scriptScoreSchema } from "./contract.ts"
import { buildSchemaFromDescriptor, type SchemaDescriptor, schemaDescriptorSchema } from "./schema-descriptor.ts"

describe("schemaDescriptorSchema", () => {
  it("accepts the canonical evaluation judge descriptor", () => {
    const descriptor = {
      kind: "object",
      shape: {
        passed: { kind: "boolean" },
        feedback: { kind: "string" },
      },
    }

    expect(schemaDescriptorSchema.safeParse(descriptor).success).toBe(true)
  })

  it("rejects unknown kinds", () => {
    expect(schemaDescriptorSchema.safeParse({ kind: "function" }).success).toBe(false)
  })
})

describe("buildSchemaFromDescriptor", () => {
  it("reconstructs the judge schema with real validation semantics", () => {
    const schema = buildSchemaFromDescriptor({
      kind: "object",
      shape: {
        passed: { kind: "boolean" },
        feedback: { kind: "string" },
      },
    })

    expect(schema.safeParse({ passed: true, feedback: "ok" }).success).toBe(true)
    expect(schema.safeParse({ passed: "yes", feedback: "ok" }).success).toBe(false)
    expect(schema.safeParse({ passed: true }).success).toBe(false)
  })

  it("applies modifiers: optional, nullable, bounds, enums, unions", () => {
    const descriptor: SchemaDescriptor = {
      kind: "object",
      shape: {
        label: { kind: "enum", values: ["low", "high"] },
        score: { kind: "number", min: 0, max: 1 },
        count: { kind: "number", int: true },
        note: { kind: "string", minLength: 2, optional: true },
        ref: { kind: "union", options: [{ kind: "string" }, { kind: "number" }], nullable: true },
        tags: { kind: "array", element: { kind: "literal", value: "x" } },
      },
    }
    const schema = buildSchemaFromDescriptor(descriptor)

    expect(schema.safeParse({ label: "low", score: 0.5, count: 2, ref: null, tags: ["x"] }).success).toBe(true)
    expect(schema.safeParse({ label: "mid", score: 0.5, count: 2, ref: 1, tags: [] }).success).toBe(false)
    expect(schema.safeParse({ label: "low", score: 2, count: 2, ref: 1, tags: [] }).success).toBe(false)
    expect(schema.safeParse({ label: "low", score: 0.5, count: 2.5, ref: 1, tags: [] }).success).toBe(false)
    expect(schema.safeParse({ label: "low", score: 0.5, count: 2, ref: 1, tags: ["y"] }).success).toBe(false)
    expect(schema.safeParse({ label: "low", score: 0.5, count: 2, ref: 1, tags: [], note: "a" }).success).toBe(false)
  })

  it("preserves descriptions for structured generation prompts", () => {
    const schema = buildSchemaFromDescriptor({ kind: "string", description: "the verdict" })
    expect(schema.description).toBe("the verdict")
  })
})

describe("score contract", () => {
  it("validates the Score shape and bounds", () => {
    expect(scriptScoreSchema.safeParse({ value: 0.7, feedback: "why" }).success).toBe(true)
    expect(scriptScoreSchema.safeParse({ value: 1 }).success).toBe(true)
    expect(scriptScoreSchema.safeParse({ value: 1.2 }).success).toBe(false)
    expect(scriptScoreSchema.safeParse({ value: -0.1 }).success).toBe(false)
  })

  it("derives membership from the threshold on the host side", () => {
    expect(isScoreMatch(0.5)).toBe(true)
    expect(isScoreMatch(0.49)).toBe(false)
    expect(isScoreMatch(0.3, 0.2)).toBe(true)
  })
})
