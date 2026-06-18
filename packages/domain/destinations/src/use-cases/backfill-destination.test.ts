import {
  ChSqlClient,
  DestinationId,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
  UserId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import type { SpanDetail } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import { createDestination, type Destination } from "../entities/destination.ts"
import { defaultSourceConfig, type SpansSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState, type DestinationSourceState } from "../entities/destination-source-state.ts"
import { NonRetryableDeliveryError, RetryableDeliveryError } from "../errors.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationRetentionPolicy } from "../ports/destination-retention-policy.ts"
import { type DestinationSourceReader, DestinationSourceReaders } from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationDeliverer } from "../testing/fake-destination-deliverer.ts"
import { createFakeDestinationMapper } from "../testing/fake-destination-mapper.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeRetentionPolicy } from "../testing/fake-destination-retention-policy.ts"
import {
  createFakeDestinationSourceReader,
  fakeSourceReaderRegistry,
} from "../testing/fake-destination-source-reader.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import {
  type BackfillWindowJob,
  backfillDestinationUseCase,
  backfillSegments,
  type RunBackfillWindowResult,
  runBackfillWindowUseCase,
} from "./backfill-destination.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const ORG_ID = OrganizationId(cuid("o"))
const PROJECT_ID = ProjectId(cuid("p"))
const USER_ID = UserId(cuid("u"))
const DESTINATION_ID = DestinationId(cuid("d"))
const TRACE_ID = "0123456789abcdef0123456789abcdef"
const SOURCE = "spans" as const

const NOW = new Date("2026-06-01T12:00:00.000Z")
const BOUNDARY_MS = 48 * 60 * 60 * 1000
// Stand-in for the org's resolved retention window (≈ Pro's 60-ish days) used in the clamp assertions.
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
const BOUNDARY_INSTANT = new Date(NOW.getTime() - BOUNDARY_MS) // 2026-05-30T12:00:00.000Z

const makeDestination = (overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
    id: DESTINATION_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    name: "Acme PostHog",
    config: { kind: "posthog", host: POSTHOG_US_INGESTION_HOST, intervalMs: 300_000 },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: USER_ID,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
  }),
  ...overrides,
})

const makeState = (
  maxRecordsPerRun: number,
  overrides: Partial<DestinationSourceState> = {},
): DestinationSourceState => {
  const config: SpansSourceConfig = { ...(defaultSourceConfig(SOURCE) as SpansSourceConfig), maxRecordsPerRun }
  return {
    ...createDestinationSourceState({
      organizationId: ORG_ID,
      destinationId: DESTINATION_ID,
      source: SOURCE,
      config: defaultSourceConfig(SOURCE),
      watermark: new Date("2026-06-01T11:55:00.000Z"),
    }),
    config,
    ...overrides,
  }
}

const stubSpan = (spanId: string, ingestedAt: Date): SpanDetail => ({
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  sessionId: SessionId("session-1"),
  userId: ExternalUserId("user-1"),
  userEmail: "",
  traceId: TraceId(TRACE_ID),
  spanId: SpanId(spanId),
  parentSpanId: "",
  apiKeyId: "",
  simulationId: SimulationId(""),
  startTime: ingestedAt,
  endTime: ingestedAt,
  name: "chat",
  serviceName: "agent",
  kind: "client",
  statusCode: "ok",
  statusMessage: "",
  traceFlags: 0,
  traceState: "",
  errorType: "",
  tags: [],
  metadata: {},
  eventsJson: "",
  linksJson: "",
  operation: "chat",
  provider: "openai",
  model: "gpt-4o",
  responseModel: "",
  tokensInput: 10,
  tokensOutput: 5,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  costIsEstimated: false,
  timeToFirstTokenNs: 0,
  isStreaming: false,
  responseId: "",
  finishReasons: [],
  attrString: {},
  attrInt: {},
  attrFloat: {},
  attrBool: {},
  resourceString: {},
  scopeName: "",
  scopeVersion: "",
  ingestedAt,
  inputMessages: [],
  outputMessages: [],
  systemInstructions: [],
  toolDefinitions: [],
  toolCallId: "",
  toolName: "",
  toolNames: [],
  toolOutput: "",
  toolInput: "",
})

/** A reader that windows over a fixed record list exactly like the real spans reader (cursor exclusive, windowEnd inclusive). */
const readerFromRecords = (records: readonly SpanDetail[]): DestinationSourceReader<SpanDetail> =>
  createFakeDestinationSourceReader(({ cursor, windowEnd, limit }) => {
    const page = records
      .filter((r) => {
        const w = r.ingestedAt.getTime()
        const c = cursor.watermark.getTime()
        return (w > c || (w === c && r.spanId > cursor.id)) && w <= windowEnd.getTime()
      })
      .sort((a, b) => a.ingestedAt.getTime() - b.ingestedAt.getTime() || (a.spanId < b.spanId ? -1 : 1))
      .slice(0, limit)
    const last = page[page.length - 1]
    return { records: page, nextCursor: last ? { watermark: last.ingestedAt, id: last.spanId } : null }
  }, records)

interface SetupOpts {
  readonly records: readonly SpanDetail[]
  readonly maxRecordsPerRun?: number
  readonly historicalBoundaryMs?: number
  readonly destination?: Destination
  readonly state?: DestinationSourceState
  readonly deliveryFailure?: NonRetryableDeliveryError | RetryableDeliveryError
}

const setup = (opts: SetupOpts) => {
  const seed = opts.destination ?? makeDestination()
  const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([seed])
  const { repo: stateRepo, rows: stateRows } = createFakeDestinationSourceStateRepository(
    [opts.state ?? makeState(opts.maxRecordsPerRun ?? 50_000)],
    destinationRows,
  )
  const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
  const { deliverer, deliveries, failWith } = createFakeDestinationDeliverer(
    opts.historicalBoundaryMs === undefined ? {} : { historicalBoundaryMs: opts.historicalBoundaryMs },
  )
  if (opts.deliveryFailure) failWith(opts.deliveryFailure)
  const { mapper } = createFakeDestinationMapper()
  const reader = readerFromRecords(opts.records)

  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(DestinationSourceReaders, fakeSourceReaderRegistry(reader)),
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSourceStateRepository, stateRepo),
    Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
    Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
    Layer.succeed(DestinationRetentionPolicy, createFakeRetentionPolicy(MAX_AGE_MS)),
  )

  return { destinationRows, syncRunRows, stateRows, deliveries, layer }
}

/** Drives the whole backfill the way the worker would: initiate, then re-run each `next` window to exhaustion. */
const drainBackfill = async (layer: ReturnType<typeof setup>["layer"], start: Date) => {
  const jobs: BackfillWindowJob[] = []
  const init = await Effect.runPromise(
    backfillDestinationUseCase({
      destinationId: DESTINATION_ID,
      source: SOURCE,
      start,
      end: NOW,
      now: NOW,
      publish: (job) => Effect.sync(() => jobs.push(job)),
    }).pipe(Effect.provide(layer)),
  )
  let job: BackfillWindowJob | null = jobs[0] ?? null
  let guard = 0
  while (job && guard++ < 1000) {
    const res: RunBackfillWindowResult = await Effect.runPromise(
      runBackfillWindowUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        cursor: job.cursor,
        segmentEnd: job.segmentEnd,
        remainingSegments: job.remainingSegments,
        coverageFloor: job.coverageFloor,
        now: NOW,
      }).pipe(Effect.provide(layer)),
    )
    job = res.next
  }
  return init
}

const distinctUuids = (deliveries: ReturnType<typeof setup>["deliveries"]) =>
  new Set(deliveries.flatMap((d) => d.events.map((e) => e.uuid)))

const straddles = (window: { start: Date; end: Date }, instant: Date) =>
  window.start.getTime() < instant.getTime() && window.end.getTime() > instant.getTime()

describe("backfillSegments", () => {
  it("returns one segment when there is no boundary", () => {
    const start = new Date("2026-05-01T00:00:00.000Z")
    expect(backfillSegments({ clampedStart: start, end: NOW, boundaryMs: undefined, now: NOW })).toEqual([
      { start, end: NOW },
    ])
  })

  it("splits at the boundary so neither segment crosses it", () => {
    const start = new Date("2026-05-01T00:00:00.000Z")
    const segments = backfillSegments({ clampedStart: start, end: NOW, boundaryMs: BOUNDARY_MS, now: NOW })
    expect(segments).toHaveLength(2)
    expect(segments[0]?.start).toEqual(start)
    expect(segments[0]?.end.getTime()).toBe(BOUNDARY_INSTANT.getTime() - 1)
    expect(segments[1]?.start).toEqual(BOUNDARY_INSTANT)
    expect(segments[1]?.end).toEqual(NOW)
  })

  it("returns one live-side segment when the whole range is younger than the boundary", () => {
    const start = new Date("2026-05-31T00:00:00.000Z") // after the boundary instant
    const segments = backfillSegments({ clampedStart: start, end: NOW, boundaryMs: BOUNDARY_MS, now: NOW })
    expect(segments).toEqual([{ start, end: NOW }])
  })

  it("returns nothing for an empty range", () => {
    expect(
      backfillSegments({ clampedStart: NOW, end: new Date(NOW.getTime() - 1), boundaryMs: undefined, now: NOW }),
    ).toEqual([])
  })
})

describe("backfillDestinationUseCase (initiator)", () => {
  it("enqueues the first (historical) window, plans both segments, and marks backfill in flight", async () => {
    const { layer, stateRows } = setup({ records: [], historicalBoundaryMs: BOUNDARY_MS })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("enqueued")
    expect(res.segmentsPlanned).toBe(2)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.cursor).toEqual({ watermark: new Date("2026-05-01T00:00:00.000Z"), id: "" })
    expect(jobs[0]?.segmentEnd.getTime()).toBe(BOUNDARY_INSTANT.getTime() - 1)
    expect(jobs[0]?.remainingSegments).toHaveLength(1)
    expect(stateRows[0]?.backfillStartedAt).toEqual(NOW) // in-flight marker set
  })

  it("clamps the start to the org retention window (now − maxAgeMs)", async () => {
    const { layer } = setup({ records: [] })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2025-12-01T00:00:00.000Z"), // ~6 months back
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    const floor = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000)
    expect(res.clampedStart).toEqual(floor)
    expect(jobs[0]?.cursor.watermark).toEqual(floor)
  })

  it("reaches the retention floor when start is null (no UI date)", async () => {
    const { layer } = setup({ records: [] })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: null,
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    const floor = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000)
    expect(res.clampedStart).toEqual(floor)
    expect(jobs[0]?.cursor.watermark).toEqual(floor)
  })

  it("declines to backfill when end is null (no upper bound)", async () => {
    const { layer } = setup({ records: [] })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: null,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("skipped")
    expect(jobs).toHaveLength(0)
  })

  it("declines to backfill when end is omitted (no upper bound)", async () => {
    const { layer } = setup({ records: [] })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: null,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("skipped")
    expect(jobs).toHaveLength(0)
  })

  it("emits no work when the requested range is already covered (start ≥ end)", async () => {
    const { layer } = setup({ records: [] })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-10T00:00:00.000Z"),
        end: new Date("2026-05-01T00:00:00.000Z"), // older than start → nothing before coverage
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("empty")
    expect(jobs).toHaveLength(0)
  })

  it("stops at the supplied end bound instead of now", async () => {
    const { layer } = setup({ records: [], historicalBoundaryMs: BOUNDARY_MS })
    const jobs: BackfillWindowJob[] = []
    const end = new Date("2026-05-15T00:00:00.000Z") // well before NOW and the 48h boundary

    await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    // Single historical segment ending at `end` — never reaches NOW, so no live overlap.
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.segmentEnd).toEqual(end)
    expect(jobs[0]?.remainingSegments).toHaveLength(0)
    expect(jobs[0]?.coverageFloor).toEqual(new Date("2026-05-01T00:00:00.000Z"))
  })

  it("declines a second backfill while one is already in flight (hard one-chain guard)", async () => {
    const { layer, stateRows } = setup({
      records: [],
      state: makeState(50_000, { backfillStartedAt: NOW, updatedAt: NOW }), // fresh chain already running
    })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("in_progress")
    expect(jobs).toHaveLength(0)
    expect(stateRows[0]?.backfillStartedAt).toEqual(NOW) // existing chain's marker untouched
  })

  it("re-acquires a wedged chain whose heartbeat went stale", async () => {
    const stale = new Date(NOW.getTime() - 10 * 60_000) // older than the 5-min stale threshold
    const { layer, stateRows } = setup({
      records: [],
      state: makeState(50_000, { backfillStartedAt: stale, updatedAt: stale }),
    })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("enqueued")
    expect(jobs).toHaveLength(1)
    expect(stateRows[0]?.backfillStartedAt).toEqual(NOW) // re-claimed by this run
  })

  it("skips a non-active destination and enqueues nothing", async () => {
    const { layer } = setup({ records: [], destination: makeDestination({ status: "paused" }) })
    const jobs: BackfillWindowJob[] = []

    const res = await Effect.runPromise(
      backfillDestinationUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: NOW,
        now: NOW,
        publish: (job) => Effect.sync(() => jobs.push(job)),
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("skipped")
    expect(jobs).toHaveLength(0)
  })
})

describe("runBackfillWindowUseCase (full drain)", () => {
  it("extends coverageStartAt to the floor once the whole chain drains", async () => {
    const start = new Date("2026-05-15T00:00:00.000Z") // inside retention, before the seeded coverage start
    const { stateRows, layer } = setup({ records: [stubSpan("a1", new Date("2026-05-20T00:00:00.000Z"))] })

    expect(stateRows[0]?.coverageStartAt).toEqual(new Date("2026-06-01T11:55:00.000Z")) // seeded live start

    await drainBackfill(layer, start)

    expect(stateRows[0]?.coverageStartAt).toEqual(start) // moved back to the chain's floor
    expect(stateRows[0]?.backfillStartedAt).toBeNull() // in-flight marker cleared on completion
  })

  it("splits at the historical boundary so no delivered window straddles it", async () => {
    const records = [
      stubSpan("old1", new Date("2026-05-29T12:00:00.000Z")),
      stubSpan("old2", new Date("2026-05-29T12:00:00.000Z")),
      stubSpan("new1", new Date("2026-05-31T12:00:00.000Z")),
      stubSpan("new2", new Date("2026-05-31T12:00:00.000Z")),
    ]
    const { deliveries, syncRunRows, layer } = setup({
      records,
      historicalBoundaryMs: BOUNDARY_MS,
      maxRecordsPerRun: 1_000,
    })

    await drainBackfill(layer, new Date("2026-05-28T00:00:00.000Z"))

    expect(deliveries).toHaveLength(2)
    for (const d of deliveries) expect(straddles(d.context.window, BOUNDARY_INSTANT)).toBe(false)
    const [historical, live] = deliveries
    expect(historical?.context.window.end.getTime()).toBeLessThan(BOUNDARY_INSTANT.getTime())
    expect(live?.context.window.start).toEqual(BOUNDARY_INSTANT)
    expect(syncRunRows).toHaveLength(2)
    expect(syncRunRows.every((r) => r.status === "succeeded" && r.trigger === "backfill" && r.source === SOURCE)).toBe(
      true,
    )
  })

  it("drops records older than the 2-month clamp", async () => {
    const floor = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000)
    const records = [
      stubSpan("tooOld", new Date("2026-03-01T00:00:00.000Z")),
      stubSpan("kept", new Date("2026-05-01T00:00:00.000Z")),
    ]
    const { deliveries, layer } = setup({ records, maxRecordsPerRun: 1_000 })

    await drainBackfill(layer, new Date("2025-12-01T00:00:00.000Z"))

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.context.window.start).toEqual(floor)
    expect(deliveries[0]?.events.map((e) => e.uuid)).toEqual(["kept:event"])
  })

  it("re-running the whole backfill produces no new distinct event UUIDs", async () => {
    const records = [
      stubSpan("a1", new Date("2026-05-01T01:00:00.000Z")),
      stubSpan("a2", new Date("2026-05-01T02:00:00.000Z")),
      stubSpan("a3", new Date("2026-05-01T03:00:00.000Z")),
    ]
    const { deliveries, syncRunRows, layer } = setup({ records, maxRecordsPerRun: 2 })
    const start = new Date("2026-05-01T00:00:00.000Z")

    await drainBackfill(layer, start)
    const afterFirst = distinctUuids(deliveries)
    expect(afterFirst).toEqual(new Set(["a1:event", "a2:event", "a3:event"]))
    const runsAfterFirst = syncRunRows.length

    await drainBackfill(layer, start)
    expect(distinctUuids(deliveries)).toEqual(afterFirst)
    expect(syncRunRows.length).toBe(runsAfterFirst * 2)
  })

  it("never quarantines the destination when a window fails", async () => {
    // On the live path a non-retryable failure at consecutiveFailures=4 would tip
    // the destination to quarantined (threshold 5). Backfill must not: it propagates
    // the error (so BullMQ retries the window / the chain stops), with no quarantine
    // accounting and no sync-run row — a heavy backfill never takes down live sync.
    const { destinationRows, syncRunRows, layer } = setup({
      records: [stubSpan("a1", new Date("2026-05-01T01:00:00.000Z"))],
      state: makeState(1_000, { backfillStartedAt: NOW }), // in-flight chain (initiator already ran)
      destination: makeDestination({ consecutiveFailures: 4 }),
      deliveryFailure: new NonRetryableDeliveryError({
        kind: "posthog",
        reason: "auth",
        detail: "invalid_api_key",
        upstreamStatus: 401,
      }),
    })

    const error = await Effect.runPromise(
      runBackfillWindowUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        cursor: { watermark: new Date("2026-05-01T00:00:00.000Z"), id: "" },
        segmentEnd: NOW,
        remainingSegments: [],
        coverageFloor: new Date("2026-05-01T00:00:00.000Z"),
        now: NOW,
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(destinationRows[0]?.consecutiveFailures).toBe(4) // untouched — no quarantine accounting
    expect(destinationRows[0]?.status).toBe("active")
    expect(syncRunRows).toHaveLength(0)
  })

  it("propagates a retryable window failure without quarantining either", async () => {
    const { destinationRows, layer } = setup({
      records: [stubSpan("a1", new Date("2026-05-01T01:00:00.000Z"))],
      state: makeState(1_000, { backfillStartedAt: NOW }), // in-flight chain (initiator already ran)
      destination: makeDestination({ consecutiveFailures: 4 }),
      deliveryFailure: new RetryableDeliveryError({
        kind: "posthog",
        reason: "server_error",
        detail: "upstream_server_error",
        upstreamStatus: 503,
      }),
    })

    const error = await Effect.runPromise(
      runBackfillWindowUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        cursor: { watermark: new Date("2026-05-01T00:00:00.000Z"), id: "" },
        segmentEnd: NOW,
        remainingSegments: [],
        coverageFloor: new Date("2026-05-01T00:00:00.000Z"),
        now: NOW,
      }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(destinationRows[0]?.consecutiveFailures).toBe(4)
    expect(destinationRows[0]?.status).toBe("active")
  })

  it("stops a cancelled chain (in-flight marker cleared) without delivering", async () => {
    const { deliveries, syncRunRows, layer } = setup({
      records: [stubSpan("a1", new Date("2026-05-20T00:00:00.000Z"))],
      state: makeState(1_000), // backfillStartedAt = null → reads as cancelled
    })

    const res = await Effect.runPromise(
      runBackfillWindowUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        cursor: { watermark: new Date("2026-05-19T00:00:00.000Z"), id: "" },
        segmentEnd: NOW,
        remainingSegments: [],
        coverageFloor: new Date("2026-05-19T00:00:00.000Z"),
        now: NOW,
      }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("skipped")
    expect(res.next).toBeNull()
    expect(deliveries).toHaveLength(0)
    expect(syncRunRows).toHaveLength(0)
  })

  it("writes backfill progress on a non-final window", async () => {
    const segmentEnd = new Date("2026-05-25T00:00:00.000Z")
    const { stateRows, layer } = setup({
      records: [stubSpan("a1", new Date("2026-05-20T00:00:00.000Z"))],
      state: makeState(1_000, { backfillStartedAt: NOW }),
    })

    await Effect.runPromise(
      runBackfillWindowUseCase({
        destinationId: DESTINATION_ID,
        source: SOURCE,
        cursor: { watermark: new Date("2026-05-19T00:00:00.000Z"), id: "" },
        segmentEnd,
        remainingSegments: [{ start: new Date("2026-05-25T00:00:00.001Z"), end: NOW }], // a next segment → not final
        coverageFloor: new Date("2026-05-19T00:00:00.000Z"),
        now: NOW,
      }).pipe(Effect.provide(layer)),
    )

    expect(stateRows[0]?.backfillProgressAt).toEqual(segmentEnd)
  })

  it("with no boundary, chunks by size only into contiguous windows", async () => {
    const start = new Date("2026-05-01T00:00:00.000Z")
    const records = [1, 2, 3, 4, 5].map((n) => stubSpan(`s${n}`, new Date(`2026-05-01T0${n}:00:00.000Z`)))
    const { deliveries, layer } = setup({ records, maxRecordsPerRun: 2 }) // no historicalBoundaryMs

    await drainBackfill(layer, start)

    expect(deliveries).toHaveLength(3) // ceil(5 / 2), split for size only
    expect(deliveries.map((d) => d.events.length)).toEqual([2, 2, 1])
    expect(deliveries[0]?.context.window.start).toEqual(start)
    for (let i = 1; i < deliveries.length; i++) {
      expect(deliveries[i]?.context.window.start).toEqual(deliveries[i - 1]?.context.window.end)
    }
    expect(distinctUuids(deliveries)).toEqual(new Set(["s1:event", "s2:event", "s3:event", "s4:event", "s5:event"]))
  })
})
