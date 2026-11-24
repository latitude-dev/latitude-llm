import type { RedisClient } from "@platform/cache-redis"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import {
  createFlaggerBudgetReservations,
  isJevFlaggerPreclassifierEnabledForOrganization,
} from "./flagger-session-activities.ts"

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

const originalProjectLimit = process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT

afterEach(() => {
  if (originalProjectLimit === undefined) delete process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT
  else process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT = originalProjectLimit
})

const reservation = {
  organizationId: "org-a",
  projectId: "project-a",
  reservationId: "session-analysis",
  classifications: 2,
}

const makeBudgetReservations = (result = 1) => {
  const calls: unknown[][] = []
  let date = new Date("2026-11-24T23:59:59Z")
  const redis = {
    eval: async (...args: unknown[]) => {
      calls.push(args)
      return result
    },
  } as unknown as RedisClient
  return {
    calls,
    budgets: createFlaggerBudgetReservations({ redis, now: () => date }),
    nextDay: () => {
      date = new Date("2026-11-25T00:00:00Z")
    },
  }
}

describe("flagger budget activity wiring", () => {
  it("passes organization/project/day keys, units, and default limits to Redis", async () => {
    delete process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT
    const { calls, budgets } = makeBudgetReservations()
    expect(await Effect.runPromise(budgets.reserveProjectBudget(reservation))).toBe(true)
    expect(await Effect.runPromise(budgets.reserveQualityBudget({ ...reservation, group: "safety-suite" }))).toBe(true)
    expect(calls.map((args) => args.slice(1))).toEqual([
      [1, "org:org-a:project:project-a:flagger-budget:2026-11-24", "reservation:session-analysis", 2, 200, 172800],
      [
        1,
        "org:org-a:project:project-a:flagger-quality:safety-suite:2026-11-24",
        "reservation:session-analysis",
        1,
        5,
        172800,
      ],
    ])
  })

  it.each(["not-a-number", "-1", "1.5"])("rejects invalid configuration without reserving: %s", async (limit) => {
    process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT = limit
    const { calls, budgets } = makeBudgetReservations()
    expect(await Effect.runPromise(budgets.reserveProjectBudget(reservation))).toBe(false)
    expect(calls).toEqual([])
  })

  it("passes zero through as a closed allowance", async () => {
    process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT = "0"
    const { calls, budgets } = makeBudgetReservations(0)
    expect(await Effect.runPromise(budgets.reserveProjectBudget(reservation))).toBe(false)
    expect(calls[0]?.[5]).toBe(0)
  })

  it("separates projects, organizations, and UTC days", async () => {
    process.env.LAT_FLAGGER_PROJECT_DAILY_CLASSIFICATION_LIMIT = "25"
    const { calls, budgets, nextDay } = makeBudgetReservations()
    await Effect.runPromise(budgets.reserveProjectBudget(reservation))
    await Effect.runPromise(budgets.reserveProjectBudget({ ...reservation, projectId: "project-b" }))
    await Effect.runPromise(budgets.reserveProjectBudget({ ...reservation, organizationId: "org-b" }))
    nextDay()
    await Effect.runPromise(budgets.reserveProjectBudget(reservation))
    expect(new Set(calls.map((args) => args[2])).size).toBe(4)
    expect(calls[3]?.[2]).toBe("org:org-a:project:project-a:flagger-budget:2026-11-25")
    expect(calls.every((args) => args[5] === 25)).toBe(true)
  })
})
