import type { FilterSet } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildScoreRollupSubquery, splitScoreFilters } from "./score-filter-subquery.ts"

describe("splitScoreFilters", () => {
  it("returns undefined for both when no filters", () => {
    const result = splitScoreFilters(undefined)
    expect(result.telemetryFilters).toBeUndefined()
    expect(result.scoreFilters).toBeUndefined()
  })

  it("returns undefined for both when empty filters", () => {
    const result = splitScoreFilters({})
    expect(result.telemetryFilters).toBeUndefined()
    expect(result.scoreFilters).toBeUndefined()
  })

  it("splits telemetry and score filters", () => {
    const filters: FilterSet = {
      status: [{ op: "in", value: ["error"] }],
      "score.passed": [{ op: "eq", value: false }],
      cost: [{ op: "gte", value: 100 }],
      "score.source": [{ op: "eq", value: "evaluation" }],
    }

    const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)

    expect(telemetryFilters).toEqual({
      status: [{ op: "in", value: ["error"] }],
      cost: [{ op: "gte", value: 100 }],
    })

    expect(scoreFilters).toEqual({
      "score.passed": [{ op: "eq", value: false }],
      "score.source": [{ op: "eq", value: "evaluation" }],
    })
  })

  it("returns undefined scoreFilters when no score keys", () => {
    const filters: FilterSet = {
      status: [{ op: "eq", value: "ok" }],
    }
    const { scoreFilters } = splitScoreFilters(filters)
    expect(scoreFilters).toBeUndefined()
  })

  it("routes score.annotatorId into score filters", () => {
    const filters: FilterSet = {
      name: [{ op: "contains", value: "foo" }],
      "score.annotatorId": [{ op: "in", value: ["user-a", "user-b"] }],
    }
    const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)
    expect(telemetryFilters).toEqual({ name: [{ op: "contains", value: "foo" }] })
    expect(scoreFilters).toEqual({ "score.annotatorId": [{ op: "in", value: ["user-a", "user-b"] }] })
  })
})

describe("buildScoreRollupSubquery", () => {
  it("builds a trace_id subquery with score filters", () => {
    const scoreFilters: FilterSet = {
      "score.passed": [{ op: "eq", value: false }],
      "score.source": [{ op: "eq", value: "evaluation" }],
    }

    const { subquery, params } = buildScoreRollupSubquery("trace_id", scoreFilters, false)

    expect(subquery).toContain("trace_id IN")
    expect(subquery).toContain("SELECT trace_id")
    expect(subquery).toContain("FROM scores")
    expect(subquery).toContain("GROUP BY trace_id")
    expect(subquery).toContain("passed")
    expect(subquery).toContain("source")
    expect(subquery).not.toContain("simulation_id = ''")
    expect(Object.keys(params).length).toBe(2)
  })

  it("builds a session_id subquery", () => {
    const scoreFilters: FilterSet = {
      "score.signalId": [{ op: "neq", value: "" }],
    }

    const { subquery } = buildScoreRollupSubquery("session_id", scoreFilters, false)

    expect(subquery).toContain("session_id IN")
    expect(subquery).toContain("SELECT session_id")
    expect(subquery).toContain("GROUP BY session_id")
  })

  it("includes simulation exclusion clause when requested", () => {
    const scoreFilters: FilterSet = {
      "score.passed": [{ op: "eq", value: true }],
    }

    const { subquery } = buildScoreRollupSubquery("trace_id", scoreFilters, true)

    expect(subquery).toContain("simulation_id = ''")
  })

  it("does not include simulation clause when not requested", () => {
    const scoreFilters: FilterSet = {
      "score.passed": [{ op: "eq", value: true }],
    }

    const { subquery } = buildScoreRollupSubquery("trace_id", scoreFilters, false)

    expect(subquery).not.toContain("simulation_id = ''")
  })

  it("filters by annotator on the session subquery (people selector)", () => {
    const scoreFilters: FilterSet = {
      "score.annotatorId": [{ op: "in", value: ["user-a", "user-b"] }],
    }

    const { subquery, params } = buildScoreRollupSubquery("session_id", scoreFilters, false)

    expect(subquery).toContain("session_id IN")
    expect(subquery).toContain("annotator_id")
    expect(Object.values(params)).toContainEqual(["user-a", "user-b"])
  })

  it("expresses has-human-annotations as annotator_id != '' (people picker + toggle compose)", () => {
    const scoreFilters: FilterSet = {
      "score.annotatorId": [
        { op: "in", value: ["user-a"] },
        { op: "neq", value: "" },
      ],
    }

    const { subquery } = buildScoreRollupSubquery("trace_id", scoreFilters, false)

    expect(subquery).toContain("annotator_id")
    // Both conditions land in one subquery, AND'd together.
    expect(subquery.match(/annotator_id/g)?.length).toBe(2)
  })

  it("uses a custom parameter prefix when requested", () => {
    const scoreFilters: FilterSet = {
      "score.source": [{ op: "eq", value: "evaluation" }],
    }

    const { params } = buildScoreRollupSubquery("trace_id", scoreFilters, false, {
      paramPrefix: "batch_1_s",
    })

    expect(Object.keys(params)).toEqual(["batch_1_s_0"])
  })
})
