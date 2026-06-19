import type {
  DeliveryContext,
  DeliveryError,
  DeliveryResult,
  DeliveryWindow,
  DestinationDeliverer,
  DestinationEvent,
} from "@domain/destinations"
import {
  NonRetryableDeliveryError,
  POSTHOG_EU_INGESTION_HOST,
  POSTHOG_US_INGESTION_HOST,
  RetryableDeliveryError,
} from "@domain/destinations"
import { Duration, Effect } from "effect"
import {
  POSTHOG_BATCH_MAX_BYTES,
  POSTHOG_BATCH_MAX_EVENTS,
  POSTHOG_BATCH_PATH,
  POSTHOG_EVENT_MAX_BYTES,
  POSTHOG_FLAGS_PATH,
  POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS,
  POSTHOG_RATE_LIMIT_DEFAULT_BACKOFF_MS,
  POSTHOG_RATE_LIMIT_MAX_BACKOFF_MS,
  POSTHOG_RATE_LIMIT_MAX_RETRIES,
} from "./constants.ts"
import { defaultHostLookup, type HostLookup, isPublicUnicastIp } from "./host-guard.ts"

const KIND = "posthog" as const

/** Distinct id for the connection probe's `/flags/` call; no event is captured, so it never reaches the customer's project. */
const CONNECTION_TEST_DISTINCT_ID = "latitude-connection-test"

const PRESET_ORIGINS: ReadonlySet<string> = new Set([
  new URL(POSTHOG_US_INGESTION_HOST).origin,
  new URL(POSTHOG_EU_INGESTION_HOST).origin,
])

export interface PosthogDelivererOptions {
  readonly fetchFn?: typeof fetch
  readonly lookupHost?: HostLookup
  /** Injectable so tests don't wall-clock sleep through the in-transport 429 backoff; defaults to real sleep. */
  readonly sleep?: (ms: number) => Effect.Effect<void>
}

interface SerializedEvent {
  readonly sourceRecordId: string
  readonly json: string
  readonly bytes: number
}

const serializeEvent = (event: DestinationEvent): SerializedEvent => {
  const json = JSON.stringify({
    event: event.name,
    uuid: event.uuid,
    timestamp: event.timestamp.toISOString(),
    properties: { ...event.properties, distinct_id: event.distinctId },
  })
  return { sourceRecordId: event.sourceRecordId, json, bytes: Buffer.byteLength(json, "utf8") }
}

const groupBySourceRecord = (events: readonly SerializedEvent[]): SerializedEvent[][] => {
  const groups = new Map<string, SerializedEvent[]>()
  for (const event of events) {
    const group = groups.get(event.sourceRecordId)
    if (group) group.push(event)
    else groups.set(event.sourceRecordId, [event])
  }
  return [...groups.values()]
}

// A span yields at most 2 events (one operation event + `$ai_trace` for roots), each already filtered to
// <= POSTHOG_EVENT_MAX_BYTES before grouping — so a group is <= ~2 MiB and can never, on its own, exceed the
// 500-event or 20 MB chunk caps. Groups are kept whole on purpose (a root's events must not split across chunks).
const packChunks = (groups: readonly SerializedEvent[][], envelopeBytes: number): SerializedEvent[][] => {
  const chunks: SerializedEvent[][] = []
  let current: SerializedEvent[] = []
  let currentBytes = envelopeBytes
  for (const group of groups) {
    const groupBytes = group.reduce((sum, event) => sum + event.bytes + 1, 0)
    const overflows =
      current.length > 0 &&
      (current.length + group.length > POSTHOG_BATCH_MAX_EVENTS || currentBytes + groupBytes > POSTHOG_BATCH_MAX_BYTES)
    if (overflows) {
      chunks.push(current)
      current = []
      currentBytes = envelopeBytes
    }
    current.push(...group)
    currentBytes += groupBytes
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

const buildBody = (params: {
  apiKey: string
  historicalMigration: boolean
  chunk: readonly SerializedEvent[]
}): string => {
  const events = params.chunk.map((event) => event.json).join(",")
  return `{"api_key":${JSON.stringify(params.apiKey)},"historical_migration":${params.historicalMigration},"batch":[${events}]}`
}

const isHistoricalWindow = (window: DeliveryWindow): boolean =>
  Date.now() - window.end.getTime() > POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS

const resolveUrl = (host: string, path: string): Effect.Effect<URL, NonRetryableDeliveryError> =>
  Effect.suspend(() => {
    let base: URL
    try {
      base = new URL(host)
    } catch {
      return Effect.fail(new NonRetryableDeliveryError({ kind: KIND, reason: "config", detail: "invalid_host_url" }))
    }
    if (base.protocol !== "https:") {
      return Effect.fail(new NonRetryableDeliveryError({ kind: KIND, reason: "config", detail: "host_not_https" }))
    }
    return Effect.succeed(new URL(base.pathname.replace(/\/$/, "") + path, base.origin))
  })

const batchUrl = (host: string) => resolveUrl(host, POSTHOG_BATCH_PATH)

/**
 * Re-resolves the custom host before every POST to narrow the DNS-rebinding window. `fetch` does its own
 * lookup afterward, so a sub-TTL rebind between this check and that lookup is still possible — an egress
 * proxy is the complete mitigation; this only reduces the window.
 */
const assertPublicHost = (url: URL, lookupHost: HostLookup): Effect.Effect<void, DeliveryError> =>
  Effect.gen(function* () {
    if (PRESET_ORIGINS.has(url.origin)) return
    const addresses = yield* Effect.tryPromise({
      try: () => lookupHost(url.hostname),
      catch: () => new RetryableDeliveryError({ kind: KIND, reason: "transport", detail: "dns_resolution_failed" }),
    })
    if (addresses.length === 0) {
      return yield* new RetryableDeliveryError({ kind: KIND, reason: "transport", detail: "dns_resolution_failed" })
    }
    if (addresses.some((address) => !isPublicUnicastIp(address))) {
      return yield* new NonRetryableDeliveryError({
        kind: KIND,
        reason: "config",
        detail: "host_resolved_to_non_public_ip",
      })
    }
  })

const responseError = (status: number): DeliveryError | null => {
  if (status >= 200 && status < 300) return null
  if (status >= 300 && status < 400) {
    return new NonRetryableDeliveryError({
      kind: KIND,
      reason: "config",
      detail: "redirect_refused",
      upstreamStatus: status,
    })
  }
  if (status === 401 || status === 403) {
    return new NonRetryableDeliveryError({
      kind: KIND,
      reason: "auth",
      detail: "invalid_api_key",
      upstreamStatus: status,
    })
  }
  if (status === 429) {
    return new RetryableDeliveryError({ kind: KIND, reason: "rate_limited", upstreamStatus: status })
  }
  if (status >= 500) {
    return new RetryableDeliveryError({
      kind: KIND,
      reason: "server_error",
      detail: "upstream_server_error",
      upstreamStatus: status,
    })
  }
  return new NonRetryableDeliveryError({
    kind: KIND,
    reason: "config",
    detail: "request_rejected",
    upstreamStatus: status,
  })
}

const sendRequest = (params: {
  url: URL
  body: string
  fetchFn: typeof fetch
}): Effect.Effect<Response, DeliveryError> =>
  Effect.tryPromise({
    try: () =>
      params.fetchFn(params.url.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: params.body,
        redirect: "manual",
      }),
    catch: () => new RetryableDeliveryError({ kind: KIND, reason: "transport", detail: "transport_error" }),
  })

const postChunk = (params: { url: URL; body: string; fetchFn: typeof fetch }): Effect.Effect<void, DeliveryError> =>
  Effect.gen(function* () {
    const response = yield* sendRequest(params)
    const error = responseError(response.status)
    if (error) return yield* error
  })

const parseRetryAfterMs = (header: string | null): number | null => {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const dateMs = Date.parse(header)
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now())
}

/** Honor `Retry-After` (delta-seconds or HTTP-date), falling back to exponential backoff, capped. */
const retryAfterBackoffMs = (header: string | null, attempt: number): number => {
  const base = parseRetryAfterMs(header) ?? POSTHOG_RATE_LIMIT_DEFAULT_BACKOFF_MS * 2 ** attempt
  return Math.min(base, POSTHOG_RATE_LIMIT_MAX_BACKOFF_MS)
}

/**
 * POST one chunk, re-resolving the host each attempt (SSRF guard). On 429 honor
 * `Retry-After` and re-POST a bounded number of times; past the budget surface a
 * retryable `rate_limited` so the engine backs off without quarantining.
 */
const deliverChunk = (params: {
  url: URL
  body: string
  fetchFn: typeof fetch
  lookupHost: HostLookup
  sleep: (ms: number) => Effect.Effect<void>
}): Effect.Effect<void, DeliveryError> =>
  Effect.gen(function* () {
    let retries = 0
    while (true) {
      yield* assertPublicHost(params.url, params.lookupHost)
      const response = yield* sendRequest(params)
      if (response.status !== 429) {
        const error = responseError(response.status)
        if (error) return yield* error
        return
      }
      if (retries >= POSTHOG_RATE_LIMIT_MAX_RETRIES) {
        return yield* new RetryableDeliveryError({
          kind: KIND,
          reason: "rate_limited",
          upstreamStatus: response.status,
        })
      }
      yield* params.sleep(retryAfterBackoffMs(response.headers.get("Retry-After"), retries))
      retries += 1
    }
  })

export const createPosthogDeliverer = (options: PosthogDelivererOptions = {}): DestinationDeliverer => {
  const fetchFn = options.fetchFn ?? fetch
  const lookupHost = options.lookupHost ?? defaultHostLookup
  const sleep = options.sleep ?? ((ms: number) => Effect.sleep(Duration.millis(ms)))

  return {
    // The 48h rule is PostHog's: events older than it must use `historical_migration`.
    // Surfaced so backfill keeps any single window from straddling `now − 48h`;
    // the per-window flag is still derived below from `context.window`.
    historicalBoundaryMs: POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS,
    deliver: (events, config, credentials, context: DeliveryContext): Effect.Effect<DeliveryResult, DeliveryError> =>
      Effect.gen(function* () {
        if (config.kind !== KIND || credentials.kind !== KIND) {
          return yield* new NonRetryableDeliveryError({
            kind: KIND,
            reason: "config",
            detail: "destination_kind_mismatch",
          })
        }

        const serialized = events.map(serializeEvent)
        const kept = serialized.filter((event) => event.bytes <= POSTHOG_EVENT_MAX_BYTES)
        const dropped = serialized.length - kept.length
        if (kept.length === 0) return { delivered: 0, dropped }

        const url = yield* batchUrl(config.host)
        const historicalMigration = isHistoricalWindow(context.window)
        const envelopeBytes = Buffer.byteLength(
          buildBody({ apiKey: credentials.apiKey, historicalMigration, chunk: [] }),
          "utf8",
        )
        const chunks = packChunks(groupBySourceRecord(kept), envelopeBytes)

        let delivered = 0
        for (const chunk of chunks) {
          yield* deliverChunk({
            url,
            body: buildBody({ apiKey: credentials.apiKey, historicalMigration, chunk }),
            fetchFn,
            lookupHost,
            sleep,
          })
          delivered += chunk.length
        }
        return { delivered, dropped }
      }),

    testConnection: (config, credentials): Effect.Effect<void, DeliveryError> =>
      Effect.gen(function* () {
        if (config.kind !== KIND || credentials.kind !== KIND) {
          return yield* new NonRetryableDeliveryError({
            kind: KIND,
            reason: "config",
            detail: "destination_kind_mismatch",
          })
        }
        const url = yield* resolveUrl(config.host, POSTHOG_FLAGS_PATH)
        yield* assertPublicHost(url, lookupHost)
        yield* postChunk({
          url,
          body: JSON.stringify({ api_key: credentials.apiKey, distinct_id: CONNECTION_TEST_DISTINCT_ID }),
          fetchFn,
        })
      }),
  }
}
