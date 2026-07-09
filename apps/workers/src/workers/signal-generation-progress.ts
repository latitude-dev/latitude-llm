import type { SignalGenerationResult } from "@domain/signals"

interface SignalGenerationProgressWriter {
  writeStep(raw: string): void
  finalize(): Promise<void>
}

export function createSignalGenerationProgressWriter(params: {
  readonly setResult: (value: SignalGenerationResult) => Promise<unknown>
}): SignalGenerationProgressWriter {
  let enabled = true
  let lastStep: string | undefined
  let lastWrite = Promise.resolve()

  const writeStep = (raw: string): void => {
    if (!enabled) {
      return
    }
    const step = raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.slice(0, 120)
    if (step === undefined || step === lastStep) {
      return
    }
    lastStep = step
    lastWrite = lastWrite.then(() => params.setResult({ status: "pending", step }).catch(() => {})).then(() => {})
  }

  const finalize = async (): Promise<void> => {
    enabled = false
    await lastWrite
  }

  return { writeStep, finalize }
}
