import { existsSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Worker } from "node:worker_threads"
import {
  type BuildHierarchicalClustersInput,
  type BuildHierarchicalClustersResult,
  TAXONOMY_CLUSTERING_WORKER_MAX_OLD_GEN_MB,
  TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS,
} from "@domain/taxonomy"

interface WorkerSuccessMessage {
  readonly ok: true
  readonly result: BuildHierarchicalClustersResult
}

interface WorkerErrorMessage {
  readonly ok: false
  readonly error: string
  readonly stack?: string
}

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage

const workerEntryUrl = () => {
  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = dirname(currentFile)
  const isTypeScriptSource = extname(currentFile) === ".ts"
  if (isTypeScriptSource) {
    return { url: pathToFileURL(resolve(currentDir, "taxonomy-clustering-worker-entry.ts")), isTypeScriptSource }
  }
  const nestedEntryFile = resolve(currentDir, "activities", "taxonomy-clustering-worker-entry.cjs")
  const entryFile = existsSync(nestedEntryFile)
    ? nestedEntryFile
    : resolve(currentDir, "taxonomy-clustering-worker-entry.cjs")
  return { url: pathToFileURL(entryFile), isTypeScriptSource }
}

/**
 * Run the (synchronous, CPU-bound) divisive build off the activity's event loop
 * in a dedicated worker thread. The thread is resource-bounded so a pathological
 * corpus cannot exhaust the activity process:
 *
 *   - `resourceLimits.maxOldGenerationSizeMb` caps the V8 heap; blowing it
 *     crashes the worker (surfaced as a rejection) rather than the whole worker
 *     process.
 *   - a single wall-clock deadline bounds the run and terminates a hung or
 *     looping worker. It covers the entire worker invocation — one build today,
 *     static plus adaptive shadow later — so shadow mode shares one budget.
 *   - `worker.terminate()` runs on every terminal path (success, error, exit,
 *     timeout) so no thread is left dangling once the promise settles.
 */
export const buildHierarchicalClustersInWorker = (
  input: BuildHierarchicalClustersInput,
): Promise<BuildHierarchicalClustersResult> =>
  new Promise((resolvePromise, rejectPromise) => {
    const entry = workerEntryUrl()
    const worker = new Worker(entry.url, {
      workerData: input,
      execArgv: entry.isTypeScriptSource ? ["--import", "tsx"] : [],
      resourceLimits: { maxOldGenerationSizeMb: TAXONOMY_CLUSTERING_WORKER_MAX_OLD_GEN_MB },
    })

    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout)
      void worker.terminate()
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    timeout = setTimeout(() => {
      settle(() =>
        rejectPromise(
          new Error(`Taxonomy clustering worker timed out after ${TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS}ms`),
        ),
      )
    }, TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS)

    worker.once("message", (message: WorkerMessage) => {
      settle(() => {
        if (message.ok) {
          resolvePromise(message.result)
          return
        }
        const error = new Error(message.error)
        if (message.stack) error.stack = message.stack
        rejectPromise(error)
      })
    })
    worker.once("error", (error) => settle(() => rejectPromise(error)))
    worker.once("exit", (code) => {
      if (code === 0) return
      settle(() => rejectPromise(new Error(`Taxonomy clustering worker exited with code ${code}`)))
    })
  })
