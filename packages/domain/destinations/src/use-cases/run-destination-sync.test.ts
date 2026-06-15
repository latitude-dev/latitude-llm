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
import { SpanRepository } from "@domain/spans"
import { createFakeSpanRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_US_INGESTION_HOST } from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import { createDestination } from "../entities/destination.ts"
import { NonRetryableDeliveryError, RetryableDeliveryError } from "../errors.ts"
import { DestinationDeliverers } from "../ports/destination-deliverer.ts"
import { DestinationMappers } from "../ports/destination-mapper.ts"
import { DestinationRepository } from "../ports/destination-repository.ts"
import { DestinationSyncRunRepository } from "../ports/destination-sync-run-repository.ts"
import { createFakeDestinationDeliverer } from "../testing/fake-destination-deliverer.ts"
import { createFakeDestinationMapper } from "../testing/fake-destination-mapper.ts"
import { createFakeDestinationRepository } from "../testing/fake-destination-repository.ts"
import { createFakeDestinationSyncRunRepository } from "../testing/fake-destination-sync-run-repository.ts"
import { runDestinationSyncUseCase } from "./run-destination-sync.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const ORG_ID = OrganizationId(cuid("o"))
const PROJECT_ID = ProjectId(cuid("p"))
const USER_ID = UserId(cuid("u"))
const DESTINATION_ID = DestinationId(cuid("d"))
const TRACE_ID = "0123456789abcdef0123456789abcdef"

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
      excludePayloads: false,
      intervalMs: 300_000,
      maxSpansPerRun: 50_000,
    },
    credentials: { kind: "posthog", apiKey: "phc_test" },
    createdByUserId: USER_ID,
    createdAt: CURSOR_AT,
  }),
  cursorIngestedAt: CURSOR_AT,
  cursorSpanId: "",
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
  toolOutput: "",
  toolInput: "",
})

interface SetupOpts {
  readonly seed?: Destination
  readonly window?: { spans: readonly SpanDetail[]; nextCursor: { ingestedAt: Date; spanId: string } | null }
  readonly deliveryFailure?: RetryableDeliveryError | NonRetryableDeliveryError
  readonly mapperDropped?: number
}

const setup = (opts: SetupOpts) => {
  const seed = opts.seed ?? makeDestination()
  const { repo: destinationRepo, rows: destinationRows } = createFakeDestinationRepository([seed])
  const { repo: syncRunRepo, rows: syncRunRows } = createFakeDestinationSyncRunRepository()
  const { deliverer, deliveries, failWith } = createFakeDestinationDeliverer()
  if (opts.deliveryFailure) failWith(opts.deliveryFailure)
  const { mapper, mapped } = createFakeDestinationMapper(
    opts.mapperDropped === undefined ? {} : { dropped: opts.mapperDropped },
  )
  const { repository: spanRepo } = createFakeSpanRepository({
    listByIngestedAtWindow: () =>
      Effect.succeed({
        spans: opts.window?.spans ?? [],
        nextCursor: opts.window?.nextCursor
          ? { ingestedAt: opts.window.nextCursor.ingestedAt, spanId: SpanId(opts.window.nextCursor.spanId) }
          : null,
      }),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
    Layer.succeed(SpanRepository, spanRepo),
    Layer.succeed(DestinationRepository, destinationRepo),
    Layer.succeed(DestinationSyncRunRepository, syncRunRepo),
    Layer.succeed(DestinationDeliverers, { posthog: deliverer }),
    Layer.succeed(DestinationMappers, { posthog: mapper }),
  )

  return { destinationRows, syncRunRows, deliveries, mapped, layer }
}

describe("runDestinationSyncUseCase", () => {
  it("skips a non-active destination", async () => {
    const { destinationRows, syncRunRows, deliveries, layer } = setup({
      seed: makeDestination({ status: "quarantined" }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: makeDestination({ status: "quarantined" }), now: NOW }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(res.outcome).toBe("skipped")
    expect(deliveries).toHaveLength(0)
    expect(syncRunRows).toHaveLength(0)
    expect(destinationRows[0]?.lastRunAt).toBeNull()
  })

  it("on an empty window advances the cursor to the window end and grows idle backoff", async () => {
    const seed = makeDestination({ consecutiveEmptyRuns: 2 })
    const { destinationRows, syncRunRows, deliveries, layer } = setup({ seed })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("empty")
    expect(res.cursorAdvanced).toBe(true)
    expect(deliveries).toHaveLength(0)
    expect(destinationRows[0]?.cursorIngestedAt).toEqual(WINDOW_END)
    expect(destinationRows[0]?.cursorSpanId).toBe("")
    expect(destinationRows[0]?.consecutiveEmptyRuns).toBe(3)
    expect(destinationRows[0]?.lastRunAt).toEqual(NOW)
    expect(syncRunRows[0]?.status).toBe("succeeded")
    expect(syncRunRows[0]?.spansRead).toBe(0)
  })

  it("delivers a window, advances the compound cursor, and resets idle backoff", async () => {
    const seed = makeDestination({ consecutiveEmptyRuns: 3 })
    const ingestedAt = new Date("2026-06-01T10:05:00.000Z")
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", ingestedAt), stubSpan("aaaaaaaaaaaaaaa2", ingestedAt)]
    const nextCursor = { ingestedAt, spanId: "aaaaaaaaaaaaaaa2" }
    const { destinationRows, syncRunRows, deliveries, layer } = setup({ seed, window: { spans, nextCursor } })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("delivered")
    expect(res.spansRead).toBe(2)
    expect(res.eventsSent).toBe(2)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.context.window.start).toEqual(CURSOR_AT)
    expect(deliveries[0]?.context.window.end).toEqual(nextCursor.ingestedAt)
    expect(destinationRows[0]?.cursorIngestedAt).toEqual(nextCursor.ingestedAt)
    expect(destinationRows[0]?.cursorSpanId).toBe("aaaaaaaaaaaaaaa2")
    expect(destinationRows[0]?.consecutiveEmptyRuns).toBe(0)
    expect(syncRunRows[0]?.status).toBe("succeeded")
    expect(syncRunRows[0]?.eventsSent).toBe(2)
  })

  it("advances the cursor to a mid-batch span when the cap truncates a same-timestamp batch", async () => {
    const seed = makeDestination()
    // Two spans share an ingested_at; the cap cut the batch after the first.
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, layer } = setup({ seed, window: { spans, nextCursor } })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("delivered")
    // Cursor lands on the last delivered (ingested_at, span_id) pair, not the window end.
    expect(destinationRows[0]?.cursorIngestedAt).toEqual(CURSOR_AT)
    expect(destinationRows[0]?.cursorSpanId).toBe("aaaaaaaaaaaaaaa1")
  })

  it("propagates a retryable delivery failure without advancing the cursor or recording the run", async () => {
    const seed = makeDestination()
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, syncRunRows, layer } = setup({
      seed,
      window: { spans, nextCursor },
      deliveryFailure: new RetryableDeliveryError({ kind: "posthog", reason: "upstream_5xx", upstreamStatus: 503 }),
    })

    const error = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(destinationRows[0]?.cursorIngestedAt).toEqual(CURSOR_AT)
    expect(destinationRows[0]?.cursorSpanId).toBe("")
    expect(destinationRows[0]?.consecutiveFailures).toBe(0)
    expect(destinationRows[0]?.lastRunAt).toBeNull()
    expect(syncRunRows).toHaveLength(0)
  })

  it("counts a non-retryable failure and quarantines at the threshold", async () => {
    const seed = makeDestination({ consecutiveFailures: 4 })
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, syncRunRows, layer } = setup({
      seed,
      window: { spans, nextCursor },
      deliveryFailure: new NonRetryableDeliveryError({
        kind: "posthog",
        reason: "invalid_api_key",
        upstreamStatus: 401,
      }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("failed")
    expect(res.quarantined).toBe(true)
    expect(destinationRows[0]?.status).toBe("quarantined")
    expect(destinationRows[0]?.consecutiveFailures).toBe(5)
    expect(destinationRows[0]?.lastFailureMessage).toBe("[401] invalid_api_key")
    // Cursor untouched on a failed run.
    expect(destinationRows[0]?.cursorSpanId).toBe("")
    expect(syncRunRows[0]?.status).toBe("failed")
    expect(syncRunRows[0]?.error).toBe("[401] invalid_api_key")
  })

  it("counts a non-retryable failure below the threshold without quarantining", async () => {
    const seed = makeDestination({ consecutiveFailures: 1 })
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, layer } = setup({
      seed,
      window: { spans, nextCursor },
      deliveryFailure: new NonRetryableDeliveryError({
        kind: "posthog",
        reason: "invalid_api_key",
        upstreamStatus: 401,
      }),
    })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.quarantined).toBe(false)
    expect(destinationRows[0]?.status).toBe("active")
    expect(destinationRows[0]?.consecutiveFailures).toBe(2)
  })

  it("aborts without bookkeeping when the optimistic cursor write is stale", async () => {
    // The row holds a different cursor than the run started from → CAS rejects.
    const rowCursor = new Date("2026-06-01T11:00:00.000Z")
    const seedRow = makeDestination({ cursorIngestedAt: rowCursor, consecutiveEmptyRuns: 7 })
    const runDestination = makeDestination({ cursorIngestedAt: CURSOR_AT })
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { destinationRows, syncRunRows, layer } = setup({ seed: seedRow, window: { spans, nextCursor } })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: runDestination, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.outcome).toBe("stale")
    expect(destinationRows[0]?.cursorIngestedAt).toEqual(rowCursor)
    expect(destinationRows[0]?.consecutiveEmptyRuns).toBe(7)
    expect(destinationRows[0]?.lastRunAt).toBeNull()
    expect(syncRunRows).toHaveLength(0)
  })

  it("rolls mapper drops into events_dropped on the sync run", async () => {
    const seed = makeDestination()
    const spans = [stubSpan("aaaaaaaaaaaaaaa1", CURSOR_AT)]
    const nextCursor = { ingestedAt: CURSOR_AT, spanId: "aaaaaaaaaaaaaaa1" }
    const { syncRunRows, layer } = setup({ seed, window: { spans, nextCursor }, mapperDropped: 3 })

    const res = await Effect.runPromise(
      runDestinationSyncUseCase({ destination: seed, now: NOW }).pipe(Effect.provide(layer)),
    )

    expect(res.eventsDropped).toBe(3)
    expect(syncRunRows[0]?.eventsDropped).toBe(3)
  })
})
