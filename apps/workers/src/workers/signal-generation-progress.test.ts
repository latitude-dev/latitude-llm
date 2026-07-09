import type { SignalGenerationResult } from "@domain/signals"
import { describe, expect, it } from "vitest"
import { createSignalGenerationProgressWriter } from "./signal-generation-progress.ts"

describe("createSignalGenerationProgressWriter", () => {
  it("awaits in-flight pending writes before the caller writes a terminal result", async () => {
    const writes: SignalGenerationResult[] = []
    let releasePending: (() => void) | undefined
    const pendingGate = new Promise<void>((resolve) => {
      releasePending = resolve
    })

    const progress = createSignalGenerationProgressWriter({
      setResult: async (value) => {
        writes.push(value)
        if (value.status === "pending" && value.step === "late step") {
          await pendingGate
        }
      },
    })

    progress.writeStep("late step")
    const finalizePromise = progress.finalize()
    releasePending?.()
    await finalizePromise

    const terminal: SignalGenerationResult = {
      status: "done",
      signalId: "sig_1",
      slug: "my-signal",
    }
    writes.push(terminal)

    expect(writes.at(-1)).toEqual(terminal)
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
