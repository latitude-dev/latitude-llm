import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, type ExperimentVariant, experimentSchema } from "../entities/experiment.ts"
import { VariantMetricsReader } from "../ports/variant-metrics-reader.ts"
import { createFakeVariantMetricsReader } from "../testing/fake-variant-metrics-reader.ts"
import { listExperimentSummaryMetricsUseCase } from "./list-experiment-summary-metrics.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const variant = (id: string, baseline: boolean): ExperimentVariant => ({
  id,
  name: baseline ? "Baseline" : "Variant",
  baseline,
  filterSet: {},
  query: null,
  timeRange: null,
})

const seed = (id: string, slug: string, variants: Experiment["variants"]): Experiment =>
  experimentSchema.parse({
    id,
    organizationId,
    projectId,
    slug,
    name: slug,
    description: "",
    variants,
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  })

// Distinguish experiments by their variant count so the fake reader returns distinct counts.
const provide = () =>
  Layer.mergeAll(
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(
      VariantMetricsReader,
      VariantMetricsReader.of(
        createFakeVariantMetricsReader({
          summary: (input) => ({
            sessionsDistinct: input.populations.length * 10,
            usersDistinct: input.populations.length * 5,
          }),
        }).reader,
      ),
    ),
  )

describe("listExperimentSummaryMetricsUseCase", () => {
  it("computes distinct-union summary counts per experiment via the reader", async () => {
    const experiments = [
      seed("a".repeat(24), "one-variant", [variant("v1".padEnd(24, "0"), true)]),
      seed("b".repeat(24), "two-variants", [variant("v2".padEnd(24, "0"), true), variant("v3".padEnd(24, "0"), false)]),
    ]
    const summaries = await Effect.runPromise(
      listExperimentSummaryMetricsUseCase({ experiments }).pipe(Effect.provide(provide())),
    )
    const byId = new Map(summaries.map((s) => [s.experimentId, s]))
    expect(byId.get("a".repeat(24))).toEqual({
      experimentId: "a".repeat(24),
      sessionsDistinct: 10,
      usersDistinct: 5,
    })
    expect(byId.get("b".repeat(24))).toEqual({
      experimentId: "b".repeat(24),
      sessionsDistinct: 20,
      usersDistinct: 10,
    })
  })

  it("reports zeros for an experiment with no variants without querying the reader", async () => {
    const experiments = [seed("c".repeat(24), "empty", [])]
    const summaries = await Effect.runPromise(
      listExperimentSummaryMetricsUseCase({ experiments }).pipe(Effect.provide(provide())),
    )
    expect(summaries).toEqual([{ experimentId: "c".repeat(24), sessionsDistinct: 0, usersDistinct: 0 }])
  })

  it("returns an empty list when there are no experiments", async () => {
    const summaries = await Effect.runPromise(
      listExperimentSummaryMetricsUseCase({ experiments: [] }).pipe(Effect.provide(provide())),
    )
    expect(summaries).toEqual([])
  })
})
