import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { isJevFlaggerPreclassifierEnabledForOrganization } from "./flagger-session-activities.ts"

const organizationId = "o".repeat(24)
const originalPreclassifierEnabled = process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED
const originalApiKey = process.env.LAT_JEV_API_KEY

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.LAT_JEV_API_KEY
  else process.env.LAT_JEV_API_KEY = originalApiKey
  if (originalPreclassifierEnabled === undefined) delete process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED
  else process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED = originalPreclassifierEnabled
})

const resolvePreclassifier = (enabled: boolean, calls: { value: number }) =>
  Effect.runPromise(
    isJevFlaggerPreclassifierEnabledForOrganization(organizationId, () =>
      Effect.sync(() => {
        calls.value++
        return enabled
      }),
    ),
  )

describe("isJevFlaggerPreclassifierEnabledForOrganization", () => {
  it("does not read the organization flag until the global switch and API key are configured", async () => {
    const calls = { value: 0 }
    process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED = "false"
    process.env.LAT_JEV_API_KEY = "key"
    await expect(resolvePreclassifier(true, calls)).resolves.toBe(false)

    process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED = "true"
    delete process.env.LAT_JEV_API_KEY
    await expect(resolvePreclassifier(true, calls)).resolves.toBe(false)
    expect(calls.value).toBe(0)
  })

  it("requires the organization flag and fails closed when its lookup is unavailable", async () => {
    process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"
    const calls = { value: 0 }

    await expect(resolvePreclassifier(false, calls)).resolves.toBe(false)
    await expect(
      Effect.runPromise(
        isJevFlaggerPreclassifierEnabledForOrganization(organizationId, () => Effect.fail("unavailable")),
      ),
    ).resolves.toBe(false)
    await expect(
      Effect.runPromise(isJevFlaggerPreclassifierEnabledForOrganization(organizationId, () => Effect.never)),
    ).resolves.toBe(false)
    expect(calls.value).toBe(1)
  })

  it("enables the preclassifier only when every gate passes", async () => {
    process.env.LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED = "true"
    process.env.LAT_JEV_API_KEY = "key"
    const calls = { value: 0 }

    await expect(resolvePreclassifier(true, calls)).resolves.toBe(true)
    expect(calls.value).toBe(1)
  })
})
