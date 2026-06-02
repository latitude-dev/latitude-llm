import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { deterministicSample } from "./deterministic-sampler.ts"

const runSample = (key: string, rate: number): Promise<boolean> => Effect.runPromise(deterministicSample(key, rate))

describe("deterministicSample", () => {
  it("returns the same result for the same key", async () => {
    const key = "session-abc"
    const rate = 0.37
    const first = await runSample(key, rate)
    for (let i = 0; i < 100; i++) {
      expect(await runSample(key, rate)).toBe(first)
    }
  })

  it("always keeps when rate >= 1", async () => {
    expect(await runSample("any-key", 1)).toBe(true)
    expect(await runSample("another", 1.5)).toBe(true)
  })

  it("always drops when rate <= 0", async () => {
    expect(await runSample("any-key", 0)).toBe(false)
    expect(await runSample("another", -0.1)).toBe(false)
  })

  it("distributes ~uniformly at rate 0.5", async () => {
    const n = 10_000
    let kept = 0
    for (let i = 0; i < n; i++) {
      if (await runSample(`key-${i}`, 0.5)) kept++
    }
    const ratio = kept / n
    expect(ratio).toBeGreaterThan(0.48)
    expect(ratio).toBeLessThan(0.52)
  })

  it("distributes ~uniformly at rate 0.1", async () => {
    const n = 10_000
    let kept = 0
    for (let i = 0; i < n; i++) {
      if (await runSample(`key-${i}`, 0.1)) kept++
    }
    const ratio = kept / n
    expect(ratio).toBeGreaterThan(0.085)
    expect(ratio).toBeLessThan(0.115)
  })
})
