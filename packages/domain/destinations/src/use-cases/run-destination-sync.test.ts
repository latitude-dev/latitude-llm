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
import {
  DESTINATION_IDLE_PAUSE_AFTER_EMPTY_RUNS,
  DESTINATION_READ_PAGE_MAX,
  POSTHOG_US_INGESTION_HOST,
} from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import { createDestination } from "../entities/destination.ts"
import { defaultSourceConfig, type SpansSourceConfig } from "../entities/destination-source.ts"
import { createDestinationSourceState, type DestinationSourceState } from "../entities/destination-source-state.ts"
import { NonRetryableDeliveryError, RetryableDeliveryError } from "../errors.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import {
  type DestinationSourceReader,
  DestinationSourceReaders,
  type SourceCursor,
} from "../ports/destination-source-reader.ts"
import { DestinationSourceStateRepository } from "../ports/destination-source-state-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationDeliverer } from "../testing/fake-destination-deliverer.ts"
import { createFakeDestinationMapper } from "../testing/fake-destination-mapper.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { fakeSourceReaderRegistry, staticSourceReader } from "../testing/fake-destination-source-reader.ts"
import { createFakeDestinationSourceStateRepository } from "../testing/fake-destination-source-state-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { runDestinationSyncUseCase } from "./run-destination-sync.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const ORG_ID = OrganizationId(cuid("o"))
const PROJECT_ID = ProjectId(cuid("p"))
const USER_ID = UserId(cuid("u"))
const DESTINATION_ID = DestinationId(cuid("d"))
const TRACE_ID = "0123456789abcdef0123456789abcdef"
const SOURCE = "spans" as const

const NOW = new Date("2026-06-01T12:00:00.000Z")
// windowEnd = NOW − SAFETY_LAG (5 min)
const WINDOW_END = new Date("2026-06-01T11:55:00.000Z")
const CURSOR_AT = new Date("2026-06-01T10:00:00.000Z")

const makeDestination = (overrides: Partial<Destination> = {}): Destination => ({
  ...createDestination({
    id: DESTINATION_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    name: "Acme PostHog",
    config: {
      kind: "posthog",
      host: POSTHOG_US_INGESTION_HOST,
      intervalMs: 300_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: USER_ID,
    createdAt: CURSOR_AT,
  }),
  ...overrides,
})

const makeCursor = (overrides: Partial<DestinationSourceState> = {}): DestinationSourceState => ({
  ...createDestinationSourceState({
    organizationId: ORG_ID,
    destinationId: DESTINATION_ID,
    source: SOURCE,
    config: defaultSourceConfig(SOURCE),
    watermark: CURSOR_AT,
  }),
  ...overrides,
})

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
  startTime: new Date("2026-06-01T10:30:00.000Z"),
  endTime: new Date("2026-06-01T10:30:01.000Z"),
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

interface SetupOpts {
  readonly seed?: Destination
  readonly cursor?: DestinationSourceState
  readonly window?: { records: readonly SpanDetail[]; nextCursor: SourceCursor | null }
  readonly deliveryFailure?: RetryableDeliveryError | NonRetryableDeliveryError
  readonly mapperDropped?: number
}

const setup = (opts: SetupOpts) => {
  const seed = opts.seed ?? makeDestination()
  const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([seed])
  const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository(
    [opts.cursor ?? makeCursor()],
    destinationRows,
  )
  const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
  const { deliverer, deliveries, failWith } = createFakeDestinationDeliverer()
  if (opts.deliveryFailure) failWith(opts.deliveryFailure)
  const { mapper, mapped } = createFakeDestinationMapper(
    opts.mapperDropped === undefined ? {} : { dropped: opts.mapperDropped },
  )
  const reader = staticSourceReader({
    records: opts.window?.records ?? [],
    nextCursor: opts.window?.nextCursor ?? null,
  })

  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(DestinationSourceReaders, fakeSourceReaderRegistry(reader)),
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSourceStateRepository, cursorRepo),
    Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
    Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
  )

  return { destinationRows, cursorRows, syncRunRows, deliveries, mapped, layer }
}

describe("runDestinationSyncUseCase", () => {
  it("skips a non-active destination", async () => {
    const { cursorRows, syncRunRows, deliveries, layer } = setup({
      seed: makeDestination({ status: "quarantined" }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("skipped")
    expect(res.source).toBe(SOURCE)
    expect(deliveries).toHaveLength(0)
    expect(syncRunRows).toHaveLength(0)
    expect(cursorRows[0]?.lastRunAt).toBeNull()
  })

  it("clamps the live window read to DESTINATION_READ_PAGE_MAX even when the config allows more", async () => {
    const seenLimits: number[] = []
    const base = staticSourceReader({ records: [], nextCursor: null })
    const reader: DestinationSourceReader<SpanDetail> = {
      ...base,
      listWindow: (input) => {
        seenLimits.push(input.limit)
        return base.listWindow(input)
      },
    }
    const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([makeDestination()])
    const cursor = makeCursor({
      config: { ...(defaultSourceConfig(SOURCE) as SpansSourceConfig), maxRecordsPerRun: 50_000 },
    })
    const { repo: cursorRepo } = createFakeDestinationSourceStateRepository([cursor], destinationRows)
    const { repo: syncRunRepo } = createFakeDestinationSyncRunRepository()
    const { deliverer } = createFakeDestinationDeliverer()
    const { mapper } = createFakeDestinationMapper()
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
      Layer.succeed(DestinationSourceReaders, fakeSourceReaderRegistry(reader)),
      Layer.succeed(DestinationRepository, destinationRepo),
      Layer.succeed(DestinationSourceStateRepository, cursorRepo),
      Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
      Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
      Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
    )

    await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(seenLimits).toEqual([DESTINATION_READ_PAGE_MAX])
  })

  it("skips when the destination is missing", async () => {
    // No cursor row either; findById fails → skipped before reading the cursor.
    const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([])
    const { repo: cursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository([], destinationRows)
    const { repo: syncRunRepo } = createFakeDestinationSyncRunRepository()
    const { deliverer, deliveries } = createFakeDestinationDeliverer()
    const { mapper } = createFakeDestinationMapper()
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
      Layer.succeed(
        DestinationSourceReaders,
        fakeSourceReaderRegistry(staticSourceReader({ records: [], nextCursor: null })),
      ),
      Layer.succeed(DestinationRepository, destinationRepo),
      Layer.succeed(DestinationSourceStateRepository, cursorRepo),
      Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
      Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
      Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
    )

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("skipped")
    expect(deliveries).toHaveLength(0)
    expect(cursorRows).toHaveLength(0)
  })

  it("skips when the source has no cursor", async () => {
    const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([makeDestination()])
    const { repo: cursorRepo } = createFakeDestinationSourceStateRepository([], destinationRows)
    const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
    const { deliverer, deliveries } = createFakeDestinationDeliverer()
    const { mapper } = createFakeDestinationMapper()
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
      Layer.succeed(
        DestinationSourceReaders,
        fakeSourceReaderRegistry(staticSourceReader({ records: [], nextCursor: null })),
      ),
      Layer.succeed(DestinationRepository, destinationRepo),
      Layer.succeed(DestinationSourceStateRepository, cursorRepo),
      Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
      Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
      Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
    )

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("skipped")
    expect(deliveries).toHaveLength(0)
    expect(syncRunRows).toHaveLength(0)
  })

  it("on an empty window advances the cursor to the window end and grows idle backoff", async () => {
    const { destinationRows, cursorRows, syncRunRows, deliveries, layer } = setup({
      cursor: makeCursor({ consecutiveEmptyRuns: 2 }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("empty")
    expect(res.cursorAdvanced).toBe(true)
    // Lag = now − resulting watermark; an empty run advances to the window end (safety lag).
    expect(res.lagMs).toBe(NOW.getTime() - WINDOW_END.getTime())
    expect(res.syncRunId).toBeNull()
    expect(deliveries).toHaveLength(0)
    expect(cursorRows[0]?.watermark).toEqual(WINDOW_END)
    expect(cursorRows[0]?.watermarkId).toBe("")
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(3)
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
    // Empty runs never touch destination quarantine bookkeeping.
    expect(destinationRows[0]?.consecutiveFailures).toBe(0)
    expect(destinationRows[0]?.status).toBe("active")
    expect(syncRunRows).toHaveLength(0)
  })

  it("auto-pauses the destination once the idle threshold of empty runs is reached and resets the counter", async () => {
    const { destinationRows, cursorRows, layer } = setup({
      cursor: makeCursor({ consecutiveEmptyRuns: DESTINATION_IDLE_PAUSE_AFTER_EMPTY_RUNS - 1 }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    // The window was still empty; auto-pause is a side effect, not a distinct outcome.
    expect(res.outcome).toBe("empty")
    expect(destinationRows[0]?.status).toBe("paused")
    // Counter resets so a manual resume grants a fresh idle budget (no immediate re-pause).
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(0)
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
    // Idle never counts toward quarantine.
    expect(destinationRows[0]?.consecutiveFailures).toBe(0)
  })

  it("does not pause one empty run before the idle threshold", async () => {
    const { destinationRows, cursorRows, layer } = setup({
      cursor: makeCursor({ consecutiveEmptyRuns: DESTINATION_IDLE_PAUSE_AFTER_EMPTY_RUNS - 2 }),
    })

    await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(destinationRows[0]?.status).toBe("active")
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(DESTINATION_IDLE_PAUSE_AFTER_EMPTY_RUNS - 1)
  })

  it("delivers a window, advances the compound cursor, and resets idle backoff", async () => {
    const ingestedAt = new Date("2026-06-01T10:05:00.000Z")
    const records = [stubSpan("aaaaaaaaaaaaaaa1", ingestedAt), stubSpan("aaaaaaaaaaaaaaa2", ingestedAt)]
    const nextCursor: SourceCursor = { watermark: ingestedAt, id: "aaaaaaaaaaaaaaa2" }
    const { destinationRows, cursorRows, syncRunRows, deliveries, layer } = setup({
      cursor: makeCursor({ consecutiveEmptyRuns: 3 }),
      window: { records, nextCursor },
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("delivered")
    expect(res.source).toBe(SOURCE)
    expect(res.recordsRead).toBe(2)
    expect(res.eventsSent).toBe(2)
    // Lag = now − the delivered watermark (how far behind real-time the cursor sits).
    expect(res.lagMs).toBe(NOW.getTime() - ingestedAt.getTime())
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.context.window.start).toEqual(CURSOR_AT)
    expect(deliveries[0]?.context.window.end).toEqual(nextCursor.watermark)
    expect(cursorRows[0]?.watermark).toEqual(nextCursor.watermark)
    expect(cursorRows[0]?.watermarkId).toBe("aaaaaaaaaaaaaaa2")
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(0)
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
    expect(destinationRows[0]?.status).toBe("active")
    expect(destinationRows[0]?.consecutiveFailures).toBe(0)
    expect(syncRunRows[0]?.status).toBe("succeeded")
    expect(syncRunRows[0]?.source).toBe(SOURCE)
    expect(syncRunRows[0]?.eventsSent).toBe(2)
  })

  it("advances the cursor to a mid-batch record when the cap truncates a same-timestamp batch", async () => {
    // Two records share a watermark; the cap cut the batch after the first.
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { cursorRows, layer } = setup({ window: { records, nextCursor } })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("delivered")
    // Cursor lands on the last delivered (watermark, id) pair, not the window end.
    expect(cursorRows[0]?.watermark).toEqual(CURSOR_AT)
    expect(cursorRows[0]?.watermarkId).toBe("aaaaaaaaaaaaaaa1")
  })

  it("propagates a retryable delivery failure without advancing the cursor or recording the run", async () => {
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, cursorRows, syncRunRows, layer } = setup({
      window: { records, nextCursor },
      deliveryFailure: new RetryableDeliveryError({
        kind: "posthog",
        reason: "server_error",
        detail: "upstream_server_error",
        upstreamStatus: 503,
      }),
    })

    const error = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(cursorRows[0]?.watermark).toEqual(CURSOR_AT)
    expect(cursorRows[0]?.watermarkId).toBe("")
    expect(cursorRows[0]?.lastRunAt).toBeNull()
    expect(destinationRows[0]?.consecutiveFailures).toBe(0)
    expect(syncRunRows).toHaveLength(0)
  })

  it("counts a non-retryable failure and quarantines at the threshold", async () => {
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, cursorRows, syncRunRows, layer } = setup({
      seed: makeDestination({ consecutiveFailures: 4 }),
      window: { records, nextCursor },
      deliveryFailure: new NonRetryableDeliveryError({
        kind: "posthog",
        reason: "auth",
        detail: "invalid_api_key",
        upstreamStatus: 401,
      }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("failed")
    expect(res.quarantined).toBe(true)
    expect(destinationRows[0]?.status).toBe("quarantined")
    expect(destinationRows[0]?.consecutiveFailures).toBe(5)
    expect(destinationRows[0]?.lastFailureMessage).toBe("[401] invalid_api_key")
    // Cursor untouched on a failed run, but last_run_at is bumped.
    expect(cursorRows[0]?.watermarkId).toBe("")
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
    expect(syncRunRows[0]?.status).toBe("failed")
    expect(syncRunRows[0]?.source).toBe(SOURCE)
    expect(syncRunRows[0]?.error).toBe("[401] invalid_api_key")
    // The quarantine flip emits a notification event for the worker to fan out.
    expect(res.quarantineEvent).toEqual({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      destinationId: DESTINATION_ID,
      destinationName: "Acme PostHog",
      destinationKind: "posthog",
      failureMessage: "[401] invalid_api_key",
      quarantinedAt: NOW,
    })
  })

  it("counts a non-retryable failure below the threshold without quarantining", async () => {
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, layer } = setup({
      seed: makeDestination({ consecutiveFailures: 1 }),
      window: { records, nextCursor },
      deliveryFailure: new NonRetryableDeliveryError({
        kind: "posthog",
        reason: "auth",
        detail: "invalid_api_key",
        upstreamStatus: 401,
      }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.quarantined).toBe(false)
    expect(res.quarantineEvent).toBeNull()
    expect(destinationRows[0]?.status).toBe("active")
    expect(destinationRows[0]?.consecutiveFailures).toBe(2)
  })

  it("fails the window on a rate_limited terminal failure without counting toward quarantine", async () => {
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, cursorRows, syncRunRows, layer } = setup({
      seed: makeDestination({ consecutiveFailures: 4 }),
      window: { records, nextCursor },
      // A second adapter could surface a throttle as terminal; the engine still must not quarantine on it.
      deliveryFailure: new NonRetryableDeliveryError({ kind: "posthog", reason: "rate_limited", upstreamStatus: 429 }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("failed")
    expect(res.quarantined).toBe(false)
    expect(res.quarantineEvent).toBeNull()
    expect(destinationRows[0]?.status).toBe("active")
    expect(destinationRows[0]?.consecutiveFailures).toBe(4) // unchanged at the threshold boundary
    // Cursor untouched, last_run_at bumped, and the failure is still recorded in run history.
    expect(cursorRows[0]?.watermarkId).toBe("")
    expect(cursorRows[0]?.lastRunAt).toEqual(NOW)
    expect(syncRunRows[0]?.status).toBe("failed")
  })

  it("aborts without bookkeeping when the optimistic cursor write is stale", async () => {
    // A concurrent run moved the cursor between this run loading it and advancing it,
    // so the CAS rejects. The fake cursor repo CAS matches the loaded position, so we
    // override advanceCursor to simulate the concurrent loser.
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([makeDestination()])
    const { repo: baseCursorRepo, rows: cursorRows } = createFakeDestinationSourceStateRepository(
      [makeCursor({ consecutiveEmptyRuns: 7 })],
      destinationRows,
    )
    const cursorRepo = { ...baseCursorRepo, advanceCursor: () => Effect.succeed(false) }
    const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
    const { deliverer } = createFakeDestinationDeliverer()
    const { mapper } = createFakeDestinationMapper()
    const layer = Layer.mergeAll(
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(ChSqlClient, createFakeChSqlClient()),
      Layer.succeed(DestinationSourceReaders, fakeSourceReaderRegistry(staticSourceReader({ records, nextCursor }))),
      Layer.succeed(DestinationRepository, destinationRepo),
      Layer.succeed(DestinationSourceStateRepository, cursorRepo),
      Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
      Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
      Layer.succeed(DestinationMappers, { posthog: { spans: mapper } }),
    )

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("stale")
    // Cursor row untouched: position and idle backoff unchanged, no run recorded.
    expect(cursorRows[0]?.watermark).toEqual(CURSOR_AT)
    expect(cursorRows[0]?.watermarkId).toBe("")
    expect(cursorRows[0]?.consecutiveEmptyRuns).toBe(7)
    expect(cursorRows[0]?.lastRunAt).toBeNull()
    expect(syncRunRows).toHaveLength(0)
  })

  it("rolls mapper drops into events_dropped on the sync run", async () => {
    const records = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor: SourceCursor = { watermark: CURSOR_AT, id: "aaaaaaaaaaaaaaa1" }
    const { syncRunRows, layer } = setup({ window: { records, nextCursor }, mapperDropped: 3 })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destinationId: DESTINATION_ID, source: SOURCE, now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.eventsDropped).toBe(3)
    expect(syncRunRows[0]?.eventsDropped).toBe(3)
  })
})
