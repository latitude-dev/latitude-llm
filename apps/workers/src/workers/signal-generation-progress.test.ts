import type { SignalGenerationResult } from "@domain/signals"
import { describe, expect, it } from "vitest"
import { createSignalGenerationProgressWriter } from "./signal-generation-progress.ts"

describe("createSignalGenerationProgressWriter", () => {
  it("awaits in-flight pending writes before finalize resolves", async () => {
    const writes: SignalGenerationResult[] = []
    let releasePending: (() => void) | undefined
    const pendingGate = new Promise<void>((resolve) => {
      releasePending = resolve
    })
    let pendingWriteSettled = false

    const progress = createSignalGenerationProgressWriter({
      setResult: async (value) => {
        if (value.status === "pending" && value.step === "late step") {
          await pendingGate
          pendingWriteSettled = true
        }
        writes.push(value)
      },
    })

    progress.writeStep("late step")
    const finalizePromise = progress.finalize()

    await expect(
      Promise.race([finalizePromise.then(() => "finalized" as const), Promise.resolve("still-waiting" as const)]),
    ).resolves.toBe("still-waiting")
    expect(pendingWriteSettled).toBe(false)

    releasePending?.()
    await finalizePromise

    expect(pendingWriteSettled).toBe(true)
    expect(writes).toEqual([{ status: "pending", step: "late step" }])
  })

  it("ignores step writes after finalize", async () => {
    const writes: SignalGenerationResult[] = []
    const progress = createSignalGenerationProgressWriter({
      setResult: async (value) => {
        writes.push(value)
      },
    })

    progress.writeStep("first")
    await progress.finalize()
    progress.writeStep("second")

    expect(writes).toEqual([{ status: "pending", step: "first" }])
  })
})
