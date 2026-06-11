import { DETECTOR_HEALTH_MIN_RUNS, DetectorHealthTracker, type DetectorRunRecord } from "@domain/sandbox"
import { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { Redis } from "ioredis"
import { describe, expect, it } from "vitest"
import { RedisDetectorHealthTrackerLive } from "./detector-health.ts"

// Minimal in-memory ioredis fake covering the ops the tracker uses. Counter
// semantics only — TTL expiry is a Redis-side cleanup concern.
class FakeRedis {
  readonly store = new Map<string, string>()

  async incr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? "0") + 1
    this.store.set(key, String(next))
    return next
  }

  async expire(_key: string, _ttl: number): Promise<number> {
    return 1
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async set(key: string, value: string, _ex: string, _ttl: number, nx: string): Promise<"OK" | null> {
    if (nx === "NX" && this.store.has(key)) return null
    this.store.set(key, value)
    return "OK"
  }
}

const record = (overrides?: Partial<DetectorRunRecord>): DetectorRunRecord => ({
  organizationId: OrganizationId("o".repeat(24)),
  projectId: ProjectId("p".repeat(24)),
  ownerType: "evaluation",
  ownerId: "e".repeat(24),
  errored: false,
  ...overrides,
})

const setup = () => {
  const redis = new FakeRedis()
  const layer = RedisDetectorHealthTrackerLive(redis as unknown as Redis)
  const recordRun = (input: DetectorRunRecord) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const tracker = yield* DetectorHealthTracker
        return yield* tracker.recordRun(input)
      }).pipe(Effect.provide(layer)),
    )
  return { redis, recordRun }
}

describe("RedisDetectorHealthTrackerLive", () => {
  it("counts runs and errors per owner under org-prefixed keys", async () => {
    const { redis, recordRun } = setup()

    await recordRun(record())
    const snapshot = await recordRun(record({ errored: true }))

    expect(snapshot).toMatchObject({ runs: 2, errors: 1, degraded: false, newlyDegraded: false })
    const keys = [...redis.store.keys()]
    expect(keys.every((key) => key.startsWith(`org:${"o".repeat(24)}:detector-health:evaluation:`))).toBe(true)
  })

  it("stays healthy below the minimum run count even when every run errors", async () => {
    const { recordRun } = setup()

    let snapshot = await recordRun(record({ errored: true }))
    for (let i = 1; i < DETECTOR_HEALTH_MIN_RUNS - 1; i += 1) {
      snapshot = await recordRun(record({ errored: true }))
    }

    expect(snapshot.degraded).toBe(false)
  })

  it("degrades once past the error-rate threshold, surfacing the transition exactly once", async () => {
    const { recordRun } = setup()

    for (let i = 0; i < DETECTOR_HEALTH_MIN_RUNS - 1; i += 1) {
      await recordRun(record({ errored: true }))
    }
    const transition = await recordRun(record({ errored: true }))
    expect(transition).toMatchObject({ degraded: true, newlyDegraded: true })

    const repeat = await recordRun(record({ errored: true }))
    expect(repeat).toMatchObject({ degraded: true, newlyDegraded: false })
  })

  it("isolates owners from each other", async () => {
    const { recordRun } = setup()

    for (let i = 0; i < DETECTOR_HEALTH_MIN_RUNS; i += 1) {
      await recordRun(record({ errored: true }))
    }
    const other = await recordRun(record({ ownerId: "f".repeat(24) }))

    expect(other).toMatchObject({ runs: 1, errors: 0, degraded: false })
  })
})
