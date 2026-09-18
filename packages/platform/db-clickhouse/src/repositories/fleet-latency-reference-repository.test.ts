import { type FleetLatencyCohortSample, FleetLatencyReferenceRepository } from "@domain/admin"
import { type ChSqlClient, OrganizationId, type RepositoryError } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { FleetLatencyReferenceRepositoryLive } from "./fleet-latency-reference-repository.ts"

const ch = setupTestClickHouse()

const READER_ORG = OrganizationId("org_fleet_reader")
const SINCE = new Date("2026-01-01T00:00:00.000Z")
const UNTIL = new Date("2026-02-01T00:00:00.000Z")

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, READER_ORG))))

const withRepo = <A>(read: (repo: FleetLatencyReferenceRepository["Service"]) => Effect.Effect<A, RepositoryError>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* FleetLatencyReferenceRepository
      return yield* read(repo)
    }).pipe(withClickHouse(FleetLatencyReferenceRepositoryLive, ch.client, READER_ORG)),
  )

let spanCounter = 0
const spanRow = (overrides: Record<string, unknown>) => {
  spanCounter += 1
  return {
    organization_id: "org-a",
    project_id: "proj-a",
    session_id: "session-1",
    user_id: "",
    trace_id: String(spanCounter).padStart(32, "0"),
    span_id: String(spanCounter).padStart(16, "0"),
    parent_span_id: "",
    api_key_id: "",
    simulation_id: "",
    start_time: "2026-01-05 00:00:00.000000000",
    end_time: "2026-01-05 00:00:10.000000000",
    name: "chat",
    service_name: "svc",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    agent_name: "",
    response_model: "",
    tokens_input: 2_000,
    tokens_output: 500,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 1,
    cost_source: "estimated",
    cost_priced_provider: "",
    cost_priced_model: "",
    time_to_first_token_ns: 500_000_000,
    is_streaming: 1,
    response_id: "",
    finish_reasons: ["stop"],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
    ingested_at: "2026-01-05 00:00:00.000",
    ...overrides,
  }
}

const cohortOf = (samples: readonly FleetLatencyCohortSample[], inputBucket: string | null) =>
  samples.find((sample) => sample.inputBucket === inputBucket)

describe("FleetLatencyReferenceRepositoryLive", () => {
  it("aggregates streaming first-token readings at both granularities across tenants", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ organization_id: "org-a", time_to_first_token_ns: 300_000_000 }),
        spanRow({ organization_id: "org-b", time_to_first_token_ns: 500_000_000 }),
        spanRow({ organization_id: "org-c", time_to_first_token_ns: 700_000_000 }),
        spanRow({ organization_id: "org-a", tokens_input: 90_000, time_to_first_token_ns: 2_000_000_000 }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listTtftSamples({ since: SINCE, until: UNTIL }))
    const cohort = cohortOf(samples, "from1kTo4k")
    const providerModel = cohortOf(samples, null)

    expect(cohort).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      inputBucket: "from1kTo4k",
      outputBucket: null,
      streaming: true,
      sampleCount: 3,
      organizationCount: 3,
      median: 500_000_000,
    })
    expect(cohortOf(samples, "over64k")).toMatchObject({ sampleCount: 1, organizationCount: 1 })
    expect(providerModel).toMatchObject({
      inputBucket: null,
      outputBucket: null,
      streaming: null,
      sampleCount: 4,
      organizationCount: 3,
    })
  })

  it("counts the tenants behind a cohort so a single-tenant median can be refused", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ organization_id: "org-solo", model: "private-deploy", time_to_first_token_ns: 100_000_000 }),
        spanRow({ organization_id: "org-solo", model: "private-deploy", time_to_first_token_ns: 200_000_000 }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listTtftSamples({ since: SINCE, until: UNTIL }))
    const solo = samples.filter((sample) => sample.model === "private-deploy")

    expect(solo).not.toHaveLength(0)
    expect(solo.every((sample) => sample.organizationCount === 1)).toBe(true)
  })

  it("excludes non-streaming calls, missing first-token readings, and non-generation operations", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ model: "unary-only", is_streaming: 0 }),
        spanRow({ model: "no-ttft", time_to_first_token_ns: 0 }),
        spanRow({ model: "tool-only", operation: "execute_tool" }),
        spanRow({ model: "no-pair", provider: "" }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listTtftSamples({ since: SINCE, until: UNTIL }))

    expect(samples.map((sample) => sample.model)).not.toContain("unary-only")
    expect(samples.map((sample) => sample.model)).not.toContain("no-ttft")
    expect(samples.map((sample) => sample.model)).not.toContain("tool-only")
    expect(samples.map((sample) => sample.model)).not.toContain("no-pair")
  })

  it("keeps the freeze window closed so a rerun reproduces the same cohorts", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ model: "in-window", start_time: "2026-01-05 00:00:00.000000000" }),
        spanRow({
          model: "before-window",
          start_time: "2025-12-01 00:00:00.000000000",
          end_time: "2025-12-01 00:00:10.000000000",
        }),
        spanRow({
          model: "after-window",
          start_time: "2026-02-01 00:00:00.000000000",
          end_time: "2026-02-01 00:00:10.000000000",
        }),
      ]),
    )

    const models = (await withRepo((repo) => repo.listTtftSamples({ since: SINCE, until: UNTIL }))).map(
      (sample) => sample.model,
    )

    expect(models).toContain("in-window")
    expect(models).not.toContain("before-window")
    expect(models).not.toContain("after-window")
  })

  it("measures the generation rate after the first token and keys it on the output bucket", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({
          organization_id: "org-a",
          model: "rate-model",
          tokens_output: 500,
          time_to_first_token_ns: 1_000_000_000,
          start_time: "2026-01-06 00:00:00.000000000",
          end_time: "2026-01-06 00:00:11.000000000",
        }),
        spanRow({
          organization_id: "org-b",
          model: "rate-model",
          tokens_output: 500,
          time_to_first_token_ns: 1_000_000_000,
          start_time: "2026-01-06 00:00:00.000000000",
          end_time: "2026-01-06 00:00:11.000000000",
        }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listThroughputSamples({ since: SINCE, until: UNTIL }))
    const cohort = samples.find((sample) => sample.model === "rate-model" && sample.inputBucket !== null)

    expect(cohort).toMatchObject({
      outputBucket: "from256To1k",
      streaming: true,
      sampleCount: 2,
      organizationCount: 2,
    })
    expect(cohort?.median).toBeCloseTo(50, 5)
    expect(samples.find((sample) => sample.model === "rate-model" && sample.inputBucket === null)).toMatchObject({
      outputBucket: null,
      streaming: null,
    })
  })

  it("excludes generations that produced nothing from the rate aggregation", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ model: "empty-output", tokens_output: 0, tokens_reasoning: 0 }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listThroughputSamples({ since: SINCE, until: UNTIL }))

    expect(samples.map((sample) => sample.model)).not.toContain("empty-output")
  })

  it("excludes calls without a positive post-first-token duration", async () => {
    await runCh(
      insertJsonEachRow(ch.client, "spans", [
        spanRow({ model: "ttft-equals-duration", time_to_first_token_ns: 10_000_000_000 }),
        spanRow({ model: "ttft-exceeds-duration", time_to_first_token_ns: 11_000_000_000 }),
      ]),
    )

    const samples = await withRepo((repo) => repo.listThroughputSamples({ since: SINCE, until: UNTIL }))
    const models = samples.map((sample) => sample.model)

    expect(models).not.toContain("ttft-equals-duration")
    expect(models).not.toContain("ttft-exceeds-duration")
  })
})
