import { DATASET_LIST_SORT_COLUMNS } from "@domain/datasets"
import { sortDirectionSchema } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const datasetListCursorSchema = z.object({
  sortValue: z.string(),
  id: z.string(),
})

const listDatasetsByProjectInputSchema = z
  .object({
    projectId: z.string(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: datasetListCursorSchema.optional(),
    sortBy: z.enum(DATASET_LIST_SORT_COLUMNS).optional(),
    sortDirection: sortDirectionSchema.optional(),
  })
  .refine(
    (data) => {
      if (!data.cursor) return true
      const sortBy = data.sortBy ?? "updatedAt"
      if (sortBy === "updatedAt") {
        const date = new Date(data.cursor.sortValue)
        return !Number.isNaN(date.getTime()) && date.toISOString() === data.cursor.sortValue
      }
      return true
    },
    {
      message: "cursor.sortValue must be a valid ISO date string when sortBy is 'updatedAt'",
      path: ["cursor", "sortValue"],
    },
  )

describe("listDatasetsByProject input validation", () => {
  describe("limit validation", () => {
    it("accepts valid positive integer limit", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: 50,
      })
      expect(result.success).toBe(true)
    })

    it("accepts limit within max bound (500)", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: 500,
      })
      expect(result.success).toBe(true)
    })

    it("accepts undefined limit", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
      })
      expect(result.success).toBe(true)
    })

    it("rejects limit of 0", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: 0,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"])
      }
    })

    it("rejects negative limit", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: -5,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"])
      }
    })

    it("rejects float limit", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: 10.5,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"])
      }
    })

    it("rejects limit above max bound (501)", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        limit: 501,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"])
      }
    })
  })

  describe("cursor validation when sortBy is updatedAt", () => {
    it("accepts valid ISO date string in cursor when sortBy is updatedAt", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "updatedAt",
        cursor: {
          sortValue: "2025-01-01T12:00:00.000Z",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(true)
    })

    it("accepts valid ISO date string in cursor when sortBy is not specified (defaults to updatedAt)", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        cursor: {
          sortValue: "2025-01-01T12:00:00.000Z",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid date string in cursor when sortBy is updatedAt", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "updatedAt",
        cursor: {
          sortValue: "not-a-date",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["cursor", "sortValue"])
        expect(result.error.issues[0].message).toContain("ISO date string")
      }
    })

    it("rejects non-ISO date format in cursor when sortBy is updatedAt", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "updatedAt",
        cursor: {
          sortValue: "2025-01-01",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["cursor", "sortValue"])
      }
    })

    it("rejects timestamp number as string in cursor when sortBy is updatedAt", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "updatedAt",
        cursor: {
          sortValue: "1704110400000",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["cursor", "sortValue"])
      }
    })
  })

  describe("cursor validation when sortBy is name", () => {
    it("accepts any string in cursor when sortBy is name", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "name",
        cursor: {
          sortValue: "Apple",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(true)
    })

    it("accepts non-date string in cursor when sortBy is name", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "name",
        cursor: {
          sortValue: "not-a-date",
          id: "dataset-123",
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe("sortBy validation", () => {
    it("accepts valid sortBy: name", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "name",
      })
      expect(result.success).toBe(true)
    })

    it("accepts valid sortBy: updatedAt", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "updatedAt",
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid sortBy", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortBy: "createdAt",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("sortDirection validation", () => {
    it("accepts valid sortDirection: asc", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortDirection: "asc",
      })
      expect(result.success).toBe(true)
    })

    it("accepts valid sortDirection: desc", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortDirection: "desc",
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid sortDirection", () => {
      const result = listDatasetsByProjectInputSchema.safeParse({
        projectId: "proj-123",
        sortDirection: "invalid",
      })
      expect(result.success).toBe(false)
    })
  })
})
