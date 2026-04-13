import { describe, expect, it } from "vitest"
import { deterministicSampling } from "./deterministic-sampling.ts"

describe("deterministicSampling", () => {
  it("returns deterministic decisions for the same key", async () => {
    const input = {
      sampling: 37,
      keyParts: ["org-1", "proj-1", "trace-1", "queue-a"],
    } as const

    const first = await deterministicSampling(input)
    const second = await deterministicSampling(input)

    expect(first).toBe(second)
  })

  it("treats zero and full percentages as hard boundaries", async () => {
    await expect(
      deterministicSampling({
        sampling: 0,
        keyParts: ["org-1", "proj-1", "trace-1", "queue-a"],
      }),
    ).resolves.toBe(false)

    await expect(
      deterministicSampling({
        sampling: 100,
        keyParts: ["org-1", "proj-1", "trace-1", "queue-a"],
      }),
    ).resolves.toBe(true)
  })
})
