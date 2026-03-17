import { describe, expect, it } from "vitest"
import { buildFilters, type ColumnSchema } from "./filter-builder.ts"

const SCHEMA: ColumnSchema = {
  name: { expr: "name", kind: "string", clause: "where", chType: "String" },
  age: { expr: "age", kind: "number", clause: "where", chType: "UInt32" },
  createdAt: { expr: "created_at", kind: "date", clause: "where", chType: "DateTime64(9)" },
  tags: { expr: "tags", kind: "array", clause: "where", chType: "String" },
  score: { expr: "sum(score)", kind: "number", clause: "having", chType: "Float64" },
}

describe("buildFilters", () => {
  it("returns empty fragments for empty input", () => {
    const result = buildFilters([], SCHEMA)
    expect(result.whereFragments).toEqual([])
    expect(result.havingFragments).toEqual([])
    expect(result.params).toEqual({})
    expect(result.unknownFields).toEqual([])
  })

  describe("string filters", () => {
    it("builds eq filter", () => {
      const result = buildFilters([{ type: "string", field: "name", op: "eq", value: "alice" }], SCHEMA)
      expect(result.whereFragments).toEqual(["(name = {f0_v:String})"])
      expect(result.params).toEqual({ f0_v: "alice" })
    })

    it("builds like filter, converting * to %", () => {
      const result = buildFilters([{ type: "string", field: "name", op: "like", value: "ali*" }], SCHEMA)
      expect(result.whereFragments).toEqual(["(name LIKE {f0_v:String})"])
      expect(result.params).toEqual({ f0_v: "ali%" })
    })

    it("handles leading wildcard *ali*", () => {
      const result = buildFilters([{ type: "string", field: "name", op: "like", value: "*ali*" }], SCHEMA)
      expect(result.params.f0_v).toBe("%ali%")
    })

    it("negates a string filter", () => {
      const result = buildFilters([{ type: "string", field: "name", op: "eq", value: "alice", negated: true }], SCHEMA)
      expect(result.whereFragments).toEqual(["NOT (name = {f0_v:String})"])
    })
  })

  describe("number filters", () => {
    it("builds eq filter", () => {
      const result = buildFilters([{ type: "number", field: "age", op: "eq", value: 30 }], SCHEMA)
      expect(result.whereFragments).toEqual(["(age = {f0_v:UInt32})"])
      expect(result.params).toEqual({ f0_v: 30 })
    })

    it("builds gt filter", () => {
      const result = buildFilters([{ type: "number", field: "age", op: "gt", value: 18 }], SCHEMA)
      expect(result.whereFragments).toEqual(["(age > {f0_v:UInt32})"])
    })

    it("builds gte, lt, lte filters", () => {
      const cases = ["gte", "lt", "lte"] as const
      const ops = [">=", "<", "<="]
      for (let i = 0; i < cases.length; i++) {
        const op = cases[i]
        if (!op) continue
        const result = buildFilters([{ type: "number", field: "age", op, value: 25 }], SCHEMA)
        expect(result.whereFragments[0]).toContain(ops[i])
      }
    })

    it("builds between filter", () => {
      const result = buildFilters([{ type: "number", field: "age", op: "between", min: 18, max: 65 }], SCHEMA)
      expect(result.whereFragments).toEqual(["(age BETWEEN {f0_min:UInt32} AND {f0_max:UInt32})"])
      expect(result.params).toEqual({ f0_min: 18, f0_max: 65 })
    })

    it("negates a number filter", () => {
      const result = buildFilters([{ type: "number", field: "age", op: "gte", value: 18, negated: true }], SCHEMA)
      expect(result.whereFragments).toEqual(["NOT (age >= {f0_v:UInt32})"])
    })
  })

  describe("date filters", () => {
    const iso = "2024-01-15T10:30:00.000Z"
    const chDate = "2024-01-15T10:30:00.000"

    it("builds eq filter, stripping Z suffix", () => {
      const result = buildFilters([{ type: "date", field: "createdAt", op: "eq", value: iso }], SCHEMA)
      expect(result.whereFragments).toEqual(["(created_at = {f0_v:DateTime64(9)})"])
      expect(result.params).toEqual({ f0_v: chDate })
    })

    it("builds between filter", () => {
      const result = buildFilters([{ type: "date", field: "createdAt", op: "between", min: iso, max: iso }], SCHEMA)
      expect(result.whereFragments).toEqual(["(created_at BETWEEN {f0_min:DateTime64(9)} AND {f0_max:DateTime64(9)})"])
      expect(result.params).toEqual({ f0_min: chDate, f0_max: chDate })
    })
  })

  describe("array filters", () => {
    it("builds contains filter using has()", () => {
      const result = buildFilters([{ type: "array", field: "tags", op: "contains", value: "prod" }], SCHEMA)
      expect(result.whereFragments).toEqual(["has(tags, {f0_v:String})"])
      expect(result.params).toEqual({ f0_v: "prod" })
    })

    it("negates a contains filter", () => {
      const result = buildFilters(
        [{ type: "array", field: "tags", op: "contains", value: "dev", negated: true }],
        SCHEMA,
      )
      expect(result.whereFragments).toEqual(["NOT has(tags, {f0_v:String})"])
    })
  })

  describe("WHERE vs HAVING placement", () => {
    it("puts columns with clause=having into havingFragments", () => {
      const result = buildFilters([{ type: "number", field: "score", op: "gt", value: 0.8 }], SCHEMA)
      expect(result.whereFragments).toEqual([])
      expect(result.havingFragments).toEqual(["(sum(score) > {f0_v:Float64})"])
    })

    it("combines where and having when both are present", () => {
      const result = buildFilters(
        [
          { type: "string", field: "name", op: "eq", value: "test" },
          { type: "number", field: "score", op: "gt", value: 0.5 },
        ],
        SCHEMA,
      )
      expect(result.whereFragments).toHaveLength(1)
      expect(result.havingFragments).toHaveLength(1)
    })
  })

  describe("unknown fields", () => {
    it("tracks unknown fields and skips them", () => {
      const result = buildFilters(
        [
          { type: "string", field: "name", op: "eq", value: "test" },
          { type: "string", field: "nonExistent", op: "eq", value: "x" },
        ],
        SCHEMA,
      )
      expect(result.unknownFields).toEqual(["nonExistent"])
      expect(result.whereFragments).toHaveLength(1) // only "name" filter
    })

    it("returns empty unknownFields when all fields are valid", () => {
      const result = buildFilters([{ type: "string", field: "name", op: "eq", value: "test" }], SCHEMA)
      expect(result.unknownFields).toEqual([])
    })
  })

  describe("multiple filters with unique param names", () => {
    it("generates non-colliding param keys across filters", () => {
      const result = buildFilters(
        [
          { type: "string", field: "name", op: "eq", value: "alice" },
          { type: "number", field: "age", op: "eq", value: 30 },
        ],
        SCHEMA,
      )
      expect(Object.keys(result.params)).toEqual(["f0_v", "f1_v"])
    })
  })

  describe("ColumnDef transform", () => {
    it("applies transform to the filter value before parameterization", () => {
      // E.g. prefix all string values with a tenant namespace
      const schemaWithTransform: ColumnSchema = {
        name: {
          expr: "name",
          kind: "string",
          clause: "where",
          chType: "String",
          transform: (v) => `prefix:${v}`,
        },
      }
      const result = buildFilters([{ type: "string", field: "name", op: "eq", value: "alice" }], schemaWithTransform)
      expect(result.params.f0_v).toBe("prefix:alice")
    })
  })
})
