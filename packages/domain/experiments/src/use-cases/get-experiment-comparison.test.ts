import { ChSqlClient, NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { ExperimentMetricKey } from "../constants.ts"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { VariantMetricsReader } from "../ports/variant-metrics-reader.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { createFakeVariantMetricsReader } from "../testing/fake-variant-metrics-reader.ts"
import { getExperimentComparisonUseCase } from "./get-experiment-comparison.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const experiment: Experiment = experimentSchema.parse({
  id: "e".repeat(24),
  organizationId,
  projectId,
  slug: "exp",
  name: "Exp",
  description: "",
  variants: [
    { id: "a".repeat(24), name: "Baseline", baseline: true, filterSet: {}, query: null, timeRange: null },
    {
      id: "b".repeat(24),
      name: "Variant A",
      baseline: false,
      filterSet: {},
      query: "user frustration",
      timeRange: null,
    },
  ],
  deletedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
})

const provide = (
  repo: ExperimentRepositoryShape,
  values: (input: { query: string | null }) => Partial<Record<ExperimentMetricKey, number | null>>,
) =>
  Layer.mergeAll(
    Layer.succeed(ExperimentRepository, ExperimentRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(VariantMetricsReader, VariantMetricsReader.of(createFakeVariantMetricsReader({ values }).reader)),
  )

describe("getExperimentComparisonUseCase", () => {
  it("flags only the population metric that deviates, independently of the other", async () => {
    const { repo } = createFakeExperimentRepository([experiment])
    const comparison = await Effect.runPromise(
      getExperimentComparisonUseCase({ projectId, slug: "exp" }).pipe(
        Effect.provide(
          provide(repo, (input) =>
            input.query === null
              ? { "sessions.count": 100, "sessions.users": 50, "sessions.cost_total": 10 }
              : { "sessions.count": 200, "sessions.users": 52, "sessions.cost_total": 5 },
          ),
        ),
      ),
    )

    const baseline = comparison.variants.find((v) => v.baseline)
    const variant = comparison.variants.find((v) => !v.baseline)

    expect(comparison.experiment.slug).toBe("exp")
    expect(baseline?.deltas["sessions.count"]).toBeNull()
    expect(baseline?.approximate).toBe(false)
    expect(baseline?.deviatingPopulationKeys).toEqual([])

    expect(variant?.deltas["sessions.count"]).toBeCloseTo(1)
    expect(variant?.deltas["sessions.cost_total"]).toBeCloseTo(-0.5)
    expect(variant?.deltas["sessions.users"]).toBeCloseTo(0.04)
    // sessions.count +100% deviates but sessions.users +4% does not, so only the former is flagged.
    expect(variant?.deviatingPopulationKeys).toEqual(["sessions.count"])
    expect(variant?.approximate).toBe(true) // semantic query
  })

  it("flags the user population independently when only it deviates", async () => {
    const { repo } = createFakeExperimentRepository([experiment])
    const comparison = await Effect.runPromise(
      getExperimentComparisonUseCase({ projectId, slug: "exp" }).pipe(
        Effect.provide(
          provide(repo, (input) =>
            input.query === null
              ? { "sessions.count": 100, "sessions.users": 50 }
              : { "sessions.count": 105, "sessions.users": 90 },
          ),
        ),
      ),
    )
    const variant = comparison.variants.find((v) => !v.baseline)
    // sessions.count +5% is within threshold; sessions.users +80% is not.
    expect(variant?.deviatingPopulationKeys).toEqual(["sessions.users"])
  })

  it("flags both population metrics when the baseline population is empty but a variant has population", async () => {
    const { repo } = createFakeExperimentRepository([experiment])
    const comparison = await Effect.runPromise(
      getExperimentComparisonUseCase({ projectId, slug: "exp" }).pipe(
        Effect.provide(
          provide(repo, (input) =>
            input.query === null
              ? { "sessions.count": 0, "sessions.users": 0 }
              : { "sessions.count": 50, "sessions.users": 20 },
          ),
        ),
      ),
    )
    const variant = comparison.variants.find((v) => !v.baseline)
    // The variant has population while the baseline has none, so both deviate; the delta is an
    // unbounded increase (a % change vs a zero baseline has no finite value).
    expect(variant?.deviatingPopulationKeys).toEqual(["sessions.count", "sessions.users"])
    expect(variant?.deltas["sessions.count"]).toBe("up-from-zero")
  })

  it("does not flag deviation when neither the baseline nor the variant has population", async () => {
    const { repo } = createFakeExperimentRepository([experiment])
    const comparison = await Effect.runPromise(
      getExperimentComparisonUseCase({ projectId, slug: "exp" }).pipe(
        Effect.provide(provide(repo, () => ({ "sessions.count": 0, "sessions.users": 0 }))),
      ),
    )
    const variant = comparison.variants.find((v) => !v.baseline)
    expect(variant?.deviatingPopulationKeys).toEqual([])
  })

  it("fails with NotFoundError for a missing experiment slug", async () => {
    const { repo } = createFakeExperimentRepository([experiment])
    const error = await Effect.runPromise(
      getExperimentComparisonUseCase({ projectId, slug: "missing" }).pipe(
        Effect.flip,
        Effect.provide(provide(repo, () => ({}))),
      ),
    )
    expect(error).toBeInstanceOf(NotFoundError)
  })
})
