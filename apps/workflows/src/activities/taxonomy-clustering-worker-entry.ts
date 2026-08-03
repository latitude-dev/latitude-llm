import { parentPort, workerData } from "node:worker_threads"
import { runTaxonomyClusterBuild, type TaxonomyClusterBuildRequest } from "@domain/taxonomy"

interface WorkerSuccessMessage {
  readonly ok: true
  readonly result: ReturnType<typeof runTaxonomyClusterBuild>
}

interface WorkerErrorMessage {
  readonly ok: false
  readonly error: string
  readonly stack?: string
}

const errorMessage = (error: unknown): WorkerErrorMessage => {
  if (!(error instanceof Error)) return { ok: false, error: String(error) }
  return error.stack === undefined
    ? { ok: false, error: error.message }
    : { ok: false, error: error.message, stack: error.stack }
}

try {
  if (!parentPort) throw new Error("Taxonomy clustering worker started without a parent port")
  const result = runTaxonomyClusterBuild(workerData as TaxonomyClusterBuildRequest)
  parentPort.postMessage({ ok: true, result } satisfies WorkerSuccessMessage)
} catch (error) {
  parentPort?.postMessage(errorMessage(error))
}
