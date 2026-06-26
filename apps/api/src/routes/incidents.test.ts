import { BadRequestError } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { resolveListIncidentsFilters } from "./incidents.ts"

describe("Incidents Routes", () => {
  describe("resolveListIncidentsFilters", () => {
    it("prefers canonical source filters", () => {
      expect(
        resolveListIncidentsFilters(
          { source_type: "monitor", source_id: "111111111111111111111111" },
          { sourceType: "signal", sourceId: "222222222222222222222222" },
        ),
      ).toEqual({
        sourceTypes: ["monitor"],
        sourceId: "111111111111111111111111",
      })
    })

    it("accepts legacy singular aliases without advertising them in OpenAPI", () => {
      expect(resolveListIncidentsFilters({}, { sourceType: "signal", sourceId: "222222222222222222222222" })).toEqual({
        sourceTypes: ["signal"],
        sourceId: "222222222222222222222222",
      })
    })

    it("rejects legacy kinds filters", () => {
      expect(() => resolveListIncidentsFilters({ kinds: ["monitor"] }, {})).toThrow(BadRequestError)
    })

    it("rejects invalid legacy singular aliases", () => {
      expect(() => resolveListIncidentsFilters({}, { sourceType: "custom" })).toThrow(BadRequestError)
      expect(() => resolveListIncidentsFilters({}, { sourceId: "not-an-id" })).toThrow(BadRequestError)
    })
  })
})
