import { base64urlEncode } from "@repo/utils"
import { describe, expect, it } from "vitest"
import { buildBullMqJobOptions } from "./adapter.ts"

const LABEL = "publish(monitors, checkSavedSearchMonitors)"

describe("buildBullMqJobOptions", () => {
  it("rides a custom jobId for a bare dedupeKey (process-once idempotency)", () => {
    const opts = buildBullMqJobOptions(LABEL, { dedupeKey: "org:1:flaggers:trace-9" })
    expect(opts.jobId).toBe(base64urlEncode("org:1:flaggers:trace-9"))
    expect(opts.deduplication).toBeUndefined()
    expect(opts.delay).toBeUndefined()
  })

  it("sets no jobId at all when there is no dedupeKey", () => {
    expect(buildBullMqJobOptions(LABEL, {})).toEqual({})
    expect(buildBullMqJobOptions(LABEL, undefined)).toEqual({})
  })

  // Guards the shadow regression: a recurring throttle must not set a jobId (it would be
  // retained by removeOnComplete and shadow later publishes); coalescing rides `deduplication`.
  it("does NOT set a custom jobId for a throttled publish; drives the window via deduplication", () => {
    const opts = buildBullMqJobOptions(LABEL, { dedupeKey: "org:1:monitors:check:proj-2", throttleMs: 300_000 })
    expect(opts.jobId).toBeUndefined()
    expect(opts.delay).toBe(300_000)
    expect(opts.deduplication).toEqual({
      id: "org:1:monitors:check:proj-2",
      ttl: 300_000,
      extend: false,
      replace: false,
    })
  })

  it("does NOT set a custom jobId for a debounced publish; extends + replaces", () => {
    const opts = buildBullMqJobOptions(LABEL, { dedupeKey: "k", debounceMs: 5_000 })
    expect(opts.jobId).toBeUndefined()
    expect(opts.delay).toBe(5_000)
    expect(opts.deduplication).toEqual({ id: "k", ttl: 5_000, extend: true, replace: true })
  })

  it("does NOT set a custom jobId for a latest-throttle publish; replaces without extending", () => {
    const opts = buildBullMqJobOptions(LABEL, { dedupeKey: "k", latestThrottleMs: 2_000 })
    expect(opts.jobId).toBeUndefined()
    expect(opts.delay).toBe(2_000)
    expect(opts.deduplication).toEqual({ id: "k", ttl: 2_000, extend: false, replace: true })
  })

  it("maps attempts + exponential backoff", () => {
    const opts = buildBullMqJobOptions(LABEL, { attempts: 3, backoff: { type: "exponential", delayMs: 1_000 } })
    expect(opts.attempts).toBe(3)
    expect(opts.backoff).toEqual({ type: "exponential", delay: 1_000 })
  })

  it("rejects mutually-exclusive coalescing options", () => {
    expect(() => buildBullMqJobOptions(LABEL, { dedupeKey: "k", throttleMs: 1, debounceMs: 1 })).toThrow(
      /mutually exclusive/,
    )
  })

  it("requires a dedupeKey for throttle / latest-throttle", () => {
    expect(() => buildBullMqJobOptions(LABEL, { throttleMs: 1 })).toThrow(/require a dedupeKey/)
    expect(() => buildBullMqJobOptions(LABEL, { latestThrottleMs: 1 })).toThrow(/require a dedupeKey/)
  })
})
