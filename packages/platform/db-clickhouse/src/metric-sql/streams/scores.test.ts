import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { InnerQuery, MetricSqlInput } from "../types.ts"
import { scoresDescriptor } from "./scores.ts"

const inputFor = (breakdown?: string): MetricSqlInput<"scores"> => ({
  organizationId: OrganizationId("o".repeat(24)),
  projectId: ProjectId("p".repeat(24)),
  filterSet: {},
  query: null,
  metric: { kind: "count" },
  ...(breakdown !== undefined ? { breakdown } : {}),
  from: new Date("2026-06-01T00:00:00Z"),
  to: new Date("2026-07-01T00:00:00Z"),
})

// The descriptor contract types buildInner with `ChSqlClient` in the effect
// context, but the scores impl is a pure `Effect.sync` — safe to run directly.
const sqlFor = (breakdown?: string): string =>
  Effect.runSync(scoresDescriptor.buildInner(inputFor(breakdown)) as Effect.Effect<InnerQuery, never, never>).sql

describe("scores stream buildInner — conditional traces join", () => {
  it("joins the traces rollup for trace-dimension breakdowns", () => {
    for (const dim of ["model", "provider", "service", "tool", "tag"]) {
      const sql = sqlFor(dim)
      expect(sql, dim).toContain("LEFT JOIN")
      expect(sql, dim).toContain("tr.models AS models") // trace dims exposed for the outer GROUP BY
    }
  })

  it("skips the join for scalar breakdowns and for no breakdown", () => {
    for (const breakdown of ["signalId", "source", undefined]) {
      const sql = sqlFor(breakdown)
      expect(sql, String(breakdown)).not.toContain("LEFT JOIN")
      expect(sql, String(breakdown)).not.toContain("FROM traces")
      // still selects the score-native columns the outer query groups/aggregates on
      expect(sql, String(breakdown)).toContain("FROM scores sc")
      expect(sql, String(breakdown)).toContain("sc.signal_id AS signal_id")
    }
  })
})
