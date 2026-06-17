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
import { Effect } from "effect"
import {
  POSTHOG_BATCH_MAX_BYTES,
  POSTHOG_BATCH_MAX_EVENTS,
  POSTHOG_BATCH_PATH,
  POSTHOG_EVENT_MAX_BYTES,
  POSTHOG_FLAGS_PATH,
  POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS,
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
      return Effect.fail(new NonRetryableDeliveryError({ kind: KIND, reason: "invalid_host_url" }))
    }
    if (base.protocol !== "https:") {
      return Effect.fail(new NonRetryableDeliveryError({ kind: KIND, reason: "host_not_https" }))
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
      catch: () => new RetryableDeliveryError({ kind: KIND, reason: "dns_resolution_failed" }),
    })
    if (addresses.length === 0) {
      return yield* new RetryableDeliveryError({ kind: KIND, reason: "dns_resolution_failed" })
    }
    if (addresses.some((address) => !isPublicUnicastIp(address))) {
      return yield* new NonRetryableDeliveryError({ kind: KIND, reason: "host_resolved_to_non_public_ip" })
    }
  })

const responseError = (status: number): DeliveryError | null => {
  if (status >= 200 && status < 300) return null
  if (status >= 300 && status < 400) {
    return new NonRetryableDeliveryError({ kind: KIND, reason: "redirect_refused", upstreamStatus: status })
  }
  if (status === 401 || status === 403) {
    return new NonRetryableDeliveryError({ kind: KIND, reason: "invalid_api_key", upstreamStatus: status })
  }
  if (status === 429) {
    return new RetryableDeliveryError({ kind: KIND, reason: "rate_limited", upstreamStatus: status })
  }
  if (status >= 500) {
    return new RetryableDeliveryError({ kind: KIND, reason: "upstream_server_error", upstreamStatus: status })
  }
  return new NonRetryableDeliveryError({ kind: KIND, reason: "request_rejected", upstreamStatus: status })
}

const postChunk = (params: { url: URL; body: string; fetchFn: typeof fetch }): Effect.Effect<void, DeliveryError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        params.fetchFn(params.url.href, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: params.body,
          redirect: "manual",
        }),
      catch: () => new RetryableDeliveryError({ kind: KIND, reason: "transport_error" }),
    })
    const error = responseError(response.status)
    if (error) return yield* error
  })

export const createPosthogDeliverer = (options: PosthogDelivererOptions = {}): DestinationDeliverer => {
  const fetchFn = options.fetchFn ?? fetch
  const lookupHost = options.lookupHost ?? defaultHostLookup

  return {
    // The 48h rule is PostHog's: events older than it must use `historical_migration`.
    // Surfaced so backfill keeps any single window from straddling `now − 48h`;
    // the per-window flag is still derived below from `context.window`.
    historicalBoundaryMs: POSTHOG_HISTORICAL_MIGRATION_MIN_WINDOW_AGE_MS,
    deliver: (events, config, credentials, context: DeliveryContext): Effect.Effect<DeliveryResult, DeliveryError> =>
      Effect.gen(function* () {
        if (config.kind !== KIND || credentials.kind !== KIND) {
          return yield* new NonRetryableDeliveryError({ kind: KIND, reason: "destination_kind_mismatch" })
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
          yield* assertPublicHost(url, lookupHost)
          yield* postChunk({
            url,
            body: buildBody({ apiKey: credentials.apiKey, historicalMigration, chunk }),
            fetchFn,
          })
          delivered += chunk.length
        }
        return { delivered, dropped }
      }),

    testConnection: (config, credentials): Effect.Effect<void, DeliveryError> =>
      Effect.gen(function* () {
        if (config.kind !== KIND || credentials.kind !== KIND) {
          return yield* new NonRetryableDeliveryError({ kind: KIND, reason: "destination_kind_mismatch" })
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
