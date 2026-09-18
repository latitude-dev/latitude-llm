import { Cause, Effect, Exit, Fiber } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { isJevShadowEnabledForOrganization } from "./flagger-session-activities.ts"

const organizationId = "o".repeat(24)
const originalEnabled = process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED
const originalApiKey = process.env.LAT_JEV_API_KEY

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED
  else process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = originalEnabled
  if (originalApiKey === undefined) delete process.env.LAT_JEV_API_KEY
  else process.env.LAT_JEV_API_KEY = originalApiKey
})

const resolve = (enabled: boolean, calls: { value: number }) =>
  Effect.runPromise(
    isJevShadowEnabledForOrganization(organizationId, () =>
      Effect.sync(() => {
        calls.value++
        return enabled
      }),
    ),
  )

describe("isJevShadowEnabledForOrganization", () => {
  it("does not read the organization flag when the global switch is off", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "false"
    process.env.LAT_JEV_API_KEY = "key"
    const calls = { value: 0 }

    await expect(resolve(true, calls)).resolves.toBe(false)
    expect(calls.value).toBe(0)
  })

  it("does not read the organization flag when the API key is missing", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    delete process.env.LAT_JEV_API_KEY
    const calls = { value: 0 }

    await expect(resolve(true, calls)).resolves.toBe(false)
    expect(calls.value).toBe(0)
  })

  it("disables the shadow path when the organization flag is off or unavailable", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"
    const disabledCalls = { value: 0 }

    await expect(resolve(false, disabledCalls)).resolves.toBe(false)
    await expect(
      Effect.runPromise(isJevShadowEnabledForOrganization(organizationId, () => Effect.fail("unavailable"))),
    ).resolves.toBe(false)
    expect(disabledCalls.value).toBe(1)
  })

  it("disables the shadow path when the organization flag lookup stalls", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"

    await expect(
      Effect.runPromise(isJevShadowEnabledForOrganization(organizationId, () => Effect.never)),
    ).resolves.toBe(false)
  })

  it("disables the shadow path when the organization flag lookup defects", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"

    await expect(
      Effect.runPromise(isJevShadowEnabledForOrganization(organizationId, () => Effect.die("defect"))),
    ).resolves.toBe(false)
  })

  it("propagates external interruption during the organization flag lookup", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"
    const fiber = Effect.runFork(isJevShadowEnabledForOrganization(organizationId, () => Effect.never))

    await new Promise<void>((resolve) => setImmediate(resolve))
    await Effect.runPromise(Fiber.interrupt(fiber))
    const exit = await Effect.runPromise(Fiber.await(fiber))

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  })

  it("enables the shadow path only when every gate passes", async () => {
    process.env.LAT_JEV_FLAGGER_SHADOW_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"
    const calls = { value: 0 }

    await expect(resolve(true, calls)).resolves.toBe(true)
    expect(calls.value).toBe(1)
  })
})
