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
 *   - the timer and the thread are registered on a `using` DisposableStack, so
 *     `clearTimeout` + `worker.terminate()` run exactly once when this scope
 *     exits, on every terminal path (message, error, exit, timeout).
 */
export const buildHierarchicalClustersInWorker = async (
  input: BuildHierarchicalClustersInput,
): Promise<BuildHierarchicalClustersResult> => {
  const entry = workerEntryUrl()
  // The deadline timer and the worker thread are torn down (LIFO) when this
  // scope exits — i.e. once the awaited promise settles, on every terminal path
  // (message, error, exit, timeout). Promise settlement is idempotent, so the
  // first event wins and later ones are no-ops.
  using stack = new DisposableStack()
  const worker = new Worker(entry.url, {
    workerData: input,
    execArgv: entry.isTypeScriptSource ? ["--import", "tsx"] : [],
    resourceLimits: { maxOldGenerationSizeMb: TAXONOMY_CLUSTERING_WORKER_MAX_OLD_GEN_MB },
  })
  stack.defer(() => void worker.terminate())

  return await new Promise<BuildHierarchicalClustersResult>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`Taxonomy clustering worker timed out after ${TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS}ms`))
    }, TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS)
    stack.defer(() => clearTimeout(timeout))

    worker.once("message", (message: WorkerMessage) => {
      if (message.ok) {
        resolvePromise(message.result)
        return
      }
      const error = new Error(message.error)
      if (message.stack) error.stack = message.stack
      rejectPromise(error)
    })
    worker.once("error", (error) => rejectPromise(error))
    worker.once("exit", (code) => {
      if (code !== 0) rejectPromise(new Error(`Taxonomy clustering worker exited with code ${code}`))
    })
  })
}
