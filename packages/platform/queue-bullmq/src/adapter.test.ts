import { base64urlEncode } from "@repo/utils"
import type { Job } from "bullmq"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { buildBullMqJobOptions, resolveFinalFailureHook } from "./adapter.ts"

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

  // Leading-edge throttle: fire immediately (no delay), then drop re-adds for the window.
  // The TTL marker rate-limits like throttle, but the run lands at the start of the window
  // so a trailing-window evaluation still covers the activity that triggered it.
  it("does NOT set a custom jobId or delay for a leading-throttle publish; drops re-adds via deduplication", () => {
    const opts = buildBullMqJobOptions(LABEL, { dedupeKey: "org:1:monitors:check:proj-2", leadingThrottleMs: 300_000 })
    expect(opts.jobId).toBeUndefined()
    expect(opts.delay).toBeUndefined()
    expect(opts.deduplication).toEqual({
      id: "org:1:monitors:check:proj-2",
      ttl: 300_000,
      extend: false,
      replace: false,
    })
  })

  it("maps attempts + exponential backoff", () => {
    const opts = buildBullMqJobOptions(LABEL, { attempts: 3, backoff: { type: "exponential", delayMs: 1_000 } })
    expect(opts.attempts).toBe(3)
    expect(opts.backoff).toEqual({ type: "exponential", delay: 1_000 })
  })

  it("maps a plain delayMs to a bare delay with no deduplication marker", () => {
    const opts = buildBullMqJobOptions(LABEL, { delayMs: 10_000 })
    expect(opts.delay).toBe(10_000)
    expect(opts.deduplication).toBeUndefined()
    expect(opts.jobId).toBeUndefined()
  })

  it("keeps the dedupeKey jobId for an idempotent deferred job (delayMs + dedupeKey)", () => {
    const opts = buildBullMqJobOptions(LABEL, { delayMs: 10_000, dedupeKey: "github:delivery-guid" })
    expect(opts.delay).toBe(10_000)
    expect(opts.jobId).toBe(base64urlEncode("github:delivery-guid"))
    expect(opts.deduplication).toBeUndefined()
  })

  it("rejects delayMs combined with a coalescing option", () => {
    expect(() => buildBullMqJobOptions(LABEL, { delayMs: 1, debounceMs: 1 })).toThrow(/mutually exclusive/)
  })

  it("rejects mutually-exclusive coalescing options", () => {
    expect(() => buildBullMqJobOptions(LABEL, { dedupeKey: "k", throttleMs: 1, debounceMs: 1 })).toThrow(
      /mutually exclusive/,
    )
    expect(() => buildBullMqJobOptions(LABEL, { dedupeKey: "k", leadingThrottleMs: 1, throttleMs: 1 })).toThrow(
      /mutually exclusive/,
    )
  })

  it("requires a dedupeKey for throttle / latest-throttle / leading-throttle", () => {
    expect(() => buildBullMqJobOptions(LABEL, { throttleMs: 1 })).toThrow(/require a dedupeKey/)
    expect(() => buildBullMqJobOptions(LABEL, { latestThrottleMs: 1 })).toThrow(/require a dedupeKey/)
    expect(() => buildBullMqJobOptions(LABEL, { leadingThrottleMs: 1 })).toThrow(/require a dedupeKey/)
  })
})

describe("resolveFinalFailureHook", () => {
  const hook = vi.fn(() => Effect.void)
  const handlers = { runSync: hook }

  const job = (overrides: Partial<Job> = {}): Job =>
    ({
      id: "j1",
      name: "runSync",
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: { payload: { destinationId: "d1" } },
      ...overrides,
    }) as unknown as Job

  it("resolves the registered hook on the terminal attempt, carrying the payload and attempt counts", () => {
    const invocation = resolveFinalFailureHook(job(), handlers)
    expect(invocation).not.toBeNull()
    expect(invocation?.hook).toBe(hook)
    expect(invocation?.payload).toEqual({ destinationId: "d1" })
    expect(invocation?.context).toEqual({ attemptsMade: 3, attemptsConfigured: 3 })
  })

  it("does not resolve while the job still has retries left (willRetry)", () => {
    expect(resolveFinalFailureHook(job({ attemptsMade: 1 }), handlers)).toBeNull()
  })

  it("does not resolve when no handler is registered for the task name", () => {
    expect(resolveFinalFailureHook(job({ name: "somethingElse" }), handlers)).toBeNull()
  })

  it("does not resolve when there are no handlers for the queue", () => {
    expect(resolveFinalFailureHook(job(), undefined)).toBeNull()
  })

  it("does not resolve when the job is undefined", () => {
    expect(resolveFinalFailureHook(undefined, handlers)).toBeNull()
  })

  it("does not resolve when the job payload is missing", () => {
    expect(resolveFinalFailureHook(job({ data: { payload: undefined } }), handlers)).toBeNull()
    expect(resolveFinalFailureHook(job({ data: {} as Job["data"] }), handlers)).toBeNull()
  })

  it("treats a single-attempt job (no retries configured) as terminal", () => {
    const invocation = resolveFinalFailureHook(job({ attemptsMade: 1, opts: { attempts: 1 } }), handlers)
    expect(invocation?.context).toEqual({ attemptsMade: 1, attemptsConfigured: 1 })
  })
})
