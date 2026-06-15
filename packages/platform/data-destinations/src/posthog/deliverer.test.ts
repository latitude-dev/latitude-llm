import type {
  DeliveryContext,
  DestinationConfig,
  DestinationCredentials,
  DestinationDeliverer,
  DestinationEvent,
} from "@domain/destinations"
import { POSTHOG_US_INGESTION_HOST } from "@domain/destinations"
import { SpanId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { POSTHOG_BATCH_MAX_BYTES } from "./constants.ts"
import { createPosthogDeliverer } from "./deliverer.ts"

const HOUR_MS = 60 * 60 * 1000

const span = (seed: string) => SpanId(seed.padEnd(16, "0"))

let eventCounter = 0
const makeEvent = (overrides: Partial<DestinationEvent> = {}): DestinationEvent => {
  eventCounter += 1
  return {
    uuid: `uuid-${eventCounter}`,
    name: "$ai_span",
    distinctId: "user-1",
    timestamp: new Date("2026-06-01T00:00:00Z"),
    spanId: span(`s${eventCounter}`),
    properties: { $ai_trace_id: "trace-1" },
    ...overrides,
  }
}

const liveContext: DeliveryContext = {
  window: { start: new Date(Date.now() - 2 * HOUR_MS), end: new Date(Date.now() - 1 * HOUR_MS) },
}
const historicalContext: DeliveryContext = {
  window: { start: new Date(Date.now() - 50 * HOUR_MS), end: new Date(Date.now() - 49 * HOUR_MS) },
}

const posthogConfig = (host: string = POSTHOG_US_INGESTION_HOST): DestinationConfig => ({
  kind: "posthog",
  host,
  excludePayloads: false,
  intervalMs: 300_000,
  maxSpansPerRun: 50_000,
})

const credentials: DestinationCredentials = { kind: "posthog", apiKey: "phc_test_key" }

interface RecordedRequest {
  readonly url: string
  readonly init: RequestInit
}

const fakeFetch = (...outcomes: (number | Error)[]) => {
  const requests: RecordedRequest[] = []
  let index = 0
  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init: init ?? {} })
    const outcome = outcomes[Math.min(index, outcomes.length - 1)] ?? 200
    index += 1
    if (outcome instanceof Error) throw outcome
    return new Response(null, { status: outcome })
  }
  return { fetchFn, requests }
}

const fakeLookup = (addresses: readonly string[]) => {
  const calls: string[] = []
  const lookupHost = async (hostname: string) => {
    calls.push(hostname)
    return addresses
  }
  return { lookupHost, calls }
}

interface WireBody {
  api_key: string
  historical_migration: boolean
  batch: Array<{ event: string; uuid: string; timestamp: string; properties: Record<string, unknown> }>
}

const bodyOf = (request: RecordedRequest | undefined): WireBody => {
  if (!request) throw new Error("expected a recorded request")
  return JSON.parse(request.init.body as string)
}

const deliver = (
  deliverer: DestinationDeliverer,
  events: readonly DestinationEvent[],
  opts: { config?: DestinationConfig; context?: DeliveryContext } = {},
) =>
  Effect.runPromise(deliverer.deliver(events, opts.config ?? posthogConfig(), credentials, opts.context ?? liveContext))

const deliverFlip = (
  deliverer: DestinationDeliverer,
  events: readonly DestinationEvent[],
  opts: { config?: DestinationConfig; context?: DeliveryContext } = {},
) =>
  Effect.runPromise(
    deliverer
      .deliver(events, opts.config ?? posthogConfig(), credentials, opts.context ?? liveContext)
      .pipe(Effect.flip),
  )

describe("createPosthogDeliverer", () => {
  it("delivers events in a single /batch/ POST with the PostHog wire shape", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const { lookupHost, calls } = fakeLookup(["93.184.216.34"])
    const deliverer = createPosthogDeliverer({ fetchFn, lookupHost })
    const events = [makeEvent(), makeEvent(), makeEvent()]

    const result = await deliver(deliverer, events)

    expect(result).toEqual({ delivered: 3, dropped: 0 })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe("https://us.i.posthog.com/batch/")
    expect(requests[0]?.init.method).toBe("POST")
    expect(requests[0]?.init.redirect).toBe("manual")
    expect(requests[0]?.init.headers).toEqual({ "Content-Type": "application/json" })
    expect(calls).toHaveLength(0)

    const body = bodyOf(requests[0])
    expect(body.api_key).toBe("phc_test_key")
    expect(body.historical_migration).toBe(false)
    expect(body.batch).toHaveLength(3)
    expect(body.batch[0]).toEqual({
      event: "$ai_span",
      uuid: events[0]?.uuid,
      timestamp: "2026-06-01T00:00:00.000Z",
      properties: { $ai_trace_id: "trace-1", distinct_id: "user-1" },
    })
  })

  it("returns a successful empty result without any POST when there are no events", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const result = await deliver(deliverer, [])

    expect(result).toEqual({ delivered: 0, dropped: 0 })
    expect(requests).toHaveLength(0)
  })

  it.each([401, 403])("maps %d to a non-retryable invalid_api_key error", async (status) => {
    const { fetchFn } = fakeFetch(status)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await deliverFlip(deliverer, [makeEvent()])

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("invalid_api_key")
    expect(error.upstreamStatus).toBe(status)
  })

  it("maps 429 to a retryable rate_limited error", async () => {
    const { fetchFn } = fakeFetch(429)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await deliverFlip(deliverer, [makeEvent()])

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(error.reason).toBe("rate_limited")
    expect(error.upstreamStatus).toBe(429)
  })

  it("maps 5xx to a retryable error", async () => {
    const { fetchFn } = fakeFetch(503)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await deliverFlip(deliverer, [makeEvent()])

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(error.reason).toBe("upstream_server_error")
    expect(error.upstreamStatus).toBe(503)
  })

  it("maps transport failures to a retryable error without leaking the cause message", async () => {
    const { fetchFn } = fakeFetch(new Error("ECONNREFUSED 10.0.0.1:443 with payload echo"))
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await deliverFlip(deliverer, [makeEvent()])

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(error.reason).toBe("transport_error")
  })

  it("refuses redirects as a non-retryable error", async () => {
    const { fetchFn, requests } = fakeFetch(302)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await deliverFlip(deliverer, [makeEvent()])

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("redirect_refused")
    expect(requests[0]?.init.redirect).toBe("manual")
  })

  it("chunks at 500 events without splitting a span's events across chunks", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })
    const singles = Array.from({ length: 499 }, () => makeEvent())
    const rootSpanId = span("root")
    const pair = [
      makeEvent({ spanId: rootSpanId, name: "$ai_trace" }),
      makeEvent({ spanId: rootSpanId, name: "$ai_generation" }),
    ]

    const result = await deliver(deliverer, [...singles, ...pair])

    expect(result).toEqual({ delivered: 501, dropped: 0 })
    expect(requests).toHaveLength(2)
    expect(bodyOf(requests[0]).batch).toHaveLength(499)
    const secondBatch = bodyOf(requests[1]).batch
    expect(secondBatch.map((e) => e.uuid)).toEqual(pair.map((e) => e.uuid))
  })

  it("splits a chunk whose body would exceed the 20 MB guard", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })
    const events = Array.from({ length: 35 }, () => makeEvent({ properties: { $ai_input: "x".repeat(700_000) } }))

    const result = await deliver(deliverer, events)

    expect(result).toEqual({ delivered: 35, dropped: 0 })
    expect(requests.length).toBeGreaterThan(1)
    for (const request of requests) {
      expect(Buffer.byteLength(request.init.body as string, "utf8")).toBeLessThanOrEqual(POSTHOG_BATCH_MAX_BYTES)
    }
    expect(requests.flatMap((request) => bodyOf(request).batch)).toHaveLength(35)
  })

  it("drops events over the per-event size cap and still delivers the rest", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })
    const oversized = makeEvent({ properties: { $ai_input: "x".repeat(1_200_000) } })
    const small = makeEvent()

    const result = await deliver(deliverer, [oversized, small])

    expect(result).toEqual({ delivered: 1, dropped: 1 })
    const body = bodyOf(requests[0])
    expect(body.batch).toHaveLength(1)
    expect(body.batch[0]?.uuid).toBe(small.uuid)
  })

  it("rejects a custom host that resolves to a private IP without calling fetch", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const { lookupHost } = fakeLookup(["10.1.2.3"])
    const deliverer = createPosthogDeliverer({ fetchFn, lookupHost })

    const error = await deliverFlip(deliverer, [makeEvent()], {
      config: posthogConfig("https://posthog.internal.example"),
    })

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("host_resolved_to_non_public_ip")
    expect(requests).toHaveLength(0)
  })

  it("rejects a non-https host at request time without resolving or calling fetch", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const { lookupHost, calls } = fakeLookup(["93.184.216.34"])
    const deliverer = createPosthogDeliverer({ fetchFn, lookupHost })

    const error = await deliverFlip(deliverer, [makeEvent()], { config: posthogConfig("http://example.com") })

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("host_not_https")
    expect(calls).toHaveLength(0)
    expect(requests).toHaveLength(0)
  })

  it("maps DNS resolution failure on a custom host to a retryable error", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({
      fetchFn,
      lookupHost: async () => {
        throw new Error("ENOTFOUND")
      },
    })

    const error = await deliverFlip(deliverer, [makeEvent()], { config: posthogConfig("https://ph.example.com") })

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(error.reason).toBe("dns_resolution_failed")
    expect(requests).toHaveLength(0)
  })

  it("re-resolves a custom host before every chunk POST", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const { lookupHost, calls } = fakeLookup(["93.184.216.34"])
    const deliverer = createPosthogDeliverer({ fetchFn, lookupHost })
    const events = Array.from({ length: 501 }, () => makeEvent())

    const result = await deliver(deliverer, events, { config: posthogConfig("https://ph.example.com") })

    expect(result).toEqual({ delivered: 501, dropped: 0 })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toBe("https://ph.example.com/batch/")
    expect(calls).toEqual(["ph.example.com", "ph.example.com"])
  })

  it("sets historical_migration when the window ends more than 48h in the past", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })

    await deliver(deliverer, [makeEvent()], { context: historicalContext })

    expect(bodyOf(requests[0]).historical_migration).toBe(true)
  })

  it("delivers windows younger than 48h live", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })
    const context: DeliveryContext = {
      window: { start: new Date(Date.now() - 47 * HOUR_MS), end: new Date(Date.now() - 46 * HOUR_MS) },
    }

    await deliver(deliverer, [makeEvent()], { context })

    expect(bodyOf(requests[0]).historical_migration).toBe(false)
  })

  it("fails the whole delivery when a later chunk fails, after earlier chunks were posted", async () => {
    const { fetchFn, requests } = fakeFetch(200, 500)
    const deliverer = createPosthogDeliverer({ fetchFn })
    const events = Array.from({ length: 501 }, () => makeEvent())

    const error = await deliverFlip(deliverer, events)

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(requests).toHaveLength(2)
  })
})

const testConnection = (deliverer: DestinationDeliverer, config: DestinationConfig = posthogConfig()) =>
  Effect.runPromise(deliverer.testConnection(config, credentials))

const testConnectionFlip = (deliverer: DestinationDeliverer, config: DestinationConfig = posthogConfig()) =>
  Effect.runPromise(deliverer.testConnection(config, credentials).pipe(Effect.flip))

describe("createPosthogDeliverer.testConnection", () => {
  it("validates the key via a /flags/ POST without sending any event", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const deliverer = createPosthogDeliverer({ fetchFn })

    await testConnection(deliverer)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe("https://us.i.posthog.com/flags/?v=2")
    expect(requests[0]?.init.method).toBe("POST")
    expect(requests[0]?.init.redirect).toBe("manual")
    const body = JSON.parse(requests[0]?.init.body as string)
    expect(body.api_key).toBe("phc_test_key")
    expect(body.distinct_id).toBe("latitude-connection-test")
    expect(body.batch).toBeUndefined()
  })

  it.each([401, 403])("maps %d to a non-retryable invalid_api_key error", async (status) => {
    const { fetchFn } = fakeFetch(status)
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await testConnectionFlip(deliverer)

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("invalid_api_key")
    expect(error.upstreamStatus).toBe(status)
  })

  it("maps a transport failure to a retryable error", async () => {
    const { fetchFn } = fakeFetch(new Error("ECONNREFUSED"))
    const deliverer = createPosthogDeliverer({ fetchFn })

    const error = await testConnectionFlip(deliverer)

    expect(error._tag).toBe("RetryableDeliveryError")
    expect(error.reason).toBe("transport_error")
  })

  it("rejects a custom host that resolves to a private IP without calling fetch", async () => {
    const { fetchFn, requests } = fakeFetch(200)
    const { lookupHost } = fakeLookup(["10.1.2.3"])
    const deliverer = createPosthogDeliverer({ fetchFn, lookupHost })

    const error = await testConnectionFlip(deliverer, posthogConfig("https://posthog.internal.example"))

    expect(error._tag).toBe("NonRetryableDeliveryError")
    expect(error.reason).toBe("host_resolved_to_non_public_ip")
    expect(requests).toHaveLength(0)
  })
})
