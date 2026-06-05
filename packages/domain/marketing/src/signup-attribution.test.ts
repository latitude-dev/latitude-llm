import { CacheStore } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { signupAttributionCacheKey, toMarketingAttribution } from "./signup-attribution.ts"
import { consumeSignupAttribution } from "./use-cases/consume-signup-attribution.ts"
import { stashSignupAttribution } from "./use-cases/stash-signup-attribution.ts"

const inMemoryCache = () => {
  const store = new Map<string, string>()
  const layer = Layer.succeed(CacheStore, {
    get: (key) => Effect.succeed(store.get(key) ?? null),
    set: (key, value) => Effect.sync(() => void store.set(key, value)),
    delete: (key) => Effect.sync(() => void store.delete(key)),
  })
  return { store, layer }
}

describe("signupAttributionCacheKey", () => {
  it("lower-cases the email so lookups match regardless of casing", () => {
    expect(signupAttributionCacheKey("Foo@Bar.com")).toBe("signup-attr:foo@bar.com")
  })
})

describe("toMarketingAttribution", () => {
  it("maps session + referrer to PostHog property names", () => {
    expect(toMarketingAttribution({ sessionId: "sess_1", referrer: "https://latitude.so/pricing" })).toEqual({
      $session_id: "sess_1",
      $referrer: "https://latitude.so/pricing",
    })
  })

  it("forwards whitelisted UTM / click-id params and drops the rest", () => {
    expect(
      toMarketingAttribution({
        trackingParams: { utm_source: "google", utm_medium: "cpc", gclid: "abc", _gl: "x", baker_anon_id: "y" },
      }),
    ).toEqual({ utm_source: "google", utm_medium: "cpc", gclid: "abc" })
  })

  it("omits empty fields rather than emitting empty strings", () => {
    expect(toMarketingAttribution({ sessionId: "", trackingParams: {} })).toEqual({})
  })
})

describe("stash + consume", () => {
  it("round-trips mapped attribution and clears the key on consume", async () => {
    const { store, layer } = inMemoryCache()
    await Effect.runPromise(
      stashSignupAttribution({
        email: "A@B.com",
        attribution: { sessionId: "s1", trackingParams: { utm_source: "google", _gl: "x" } },
      }).pipe(Effect.provide(layer)),
    )
    expect(store.size).toBe(1)

    // Casing differs between stash and consume — the key normalizes it.
    const result = await Effect.runPromise(consumeSignupAttribution({ email: "a@b.com" }).pipe(Effect.provide(layer)))
    expect(result).toEqual({ $session_id: "s1", utm_source: "google" })
    expect(store.size).toBe(0)
  })

  it("stash is a no-op when there's nothing worth forwarding", async () => {
    const { store, layer } = inMemoryCache()
    await Effect.runPromise(
      stashSignupAttribution({ email: "a@b.com", attribution: { trackingParams: { _gl: "x" } } }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(store.size).toBe(0)
  })

  it("consume returns {} when nothing was stashed", async () => {
    const { layer } = inMemoryCache()
    const result = await Effect.runPromise(consumeSignupAttribution({ email: "x@y.com" }).pipe(Effect.provide(layer)))
    expect(result).toEqual({})
  })
})
