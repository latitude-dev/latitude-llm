import { dirname } from "node:path"
import type { QueueStrategy } from "@domain/annotation-queues"
import esbuild from "esbuild"
import { type PackageContext, runStaticSafetyScan, type ScanReject, sniffRegexDosRisk } from "./safety-scan.ts"

/**
 * v1 candidate loader for `ts-module` candidates: static safety scan →
 * esbuild compile (in-memory, workspace deps bundled inline) → dynamic
 * import via a `data:` URL → shape probe.
 *
 * v2 (planned, see spec §"v2: Worker isolation") swaps the dynamic-import
 * step for a worker-thread spawn so `worker.terminate()` can hard-kill
 * runaway candidates. The external `loadFlaggerCandidate` API is the seam
 * that v2 swaps without changing callers.
 */

const REQUIRED_METHOD_NAMES = [
  "hasRequiredContext",
  "detectDeterministically",
  "buildSystemPrompt",
  "buildPrompt",
] as const

interface LoadedCandidate {
  readonly shape: QueueStrategy
  readonly cleanup: () => Promise<void>
}

interface LoadCandidateInput {
  readonly hash: string
  readonly text: string
  readonly exportName: string
  readonly context: PackageContext
  /**
   * Optional hard cap on candidate source length, in characters. When the
   * candidate exceeds this, the loader throws CandidateLoadFailure with
   * stage="static-scan" before any compile/import work runs. Designed to
   * bound the proposer's tendency to grow the file every iteration —
   * trajectories surface only failing rows, so the proposer has a
   * survivorship-biased view of the file and naturally accretes code. The
   * caller anchors this to baseline size (not parent) so total drift
   * across a run is bounded rather than geometric.
   */
  readonly maxBytes?: number
}

type CandidateLoadError =
  | { readonly stage: "static-scan"; readonly reason: string }
  | { readonly stage: "compile"; readonly reason: string }
  | { readonly stage: "import"; readonly reason: string }
  | { readonly stage: "shape"; readonly reason: string }

export class CandidateLoadFailure extends Error {
  readonly stage: CandidateLoadError["stage"]
  readonly reason: string

  constructor(error: CandidateLoadError) {
    super(`[${error.stage}] ${error.reason}`)
    this.name = "CandidateLoadFailure"
    this.stage = error.stage
    this.reason = error.reason
  }
}

const cache = new Map<string, Promise<LoadedCandidate>>()

export const loadFlaggerCandidate = (input: LoadCandidateInput): Promise<LoadedCandidate> => {
  const existing = cache.get(input.hash)
  if (existing) return existing

  const promise = compileAndImport(input)
  cache.set(input.hash, promise)
  return promise
}

const compileAndImport = async (input: LoadCandidateInput): Promise<LoadedCandidate> => {
  // Cheapest stage first: size cap. Skips compile/import work for bloated
  // candidates and feeds the rejection back through the standard
  // candidate-rejected trajectory path so the proposer learns to trim.
  if (input.maxBytes !== undefined && input.text.length > input.maxBytes) {
    const overshootPct = ((input.text.length / input.maxBytes - 1) * 100).toFixed(0)
    throw new CandidateLoadFailure({
      stage: "static-scan",
      reason: `candidate file exceeds size budget: ${input.text.length} chars > ${input.maxBytes} chars cap (${overshootPct}% over). Consolidate or remove deterministic patterns rather than adding more — see the Size discipline section of your instructions.`,
    })
  }

  const scan = runStaticSafetyScan({
    source: input.text,
    exportName: input.exportName,
    context: input.context,
  })
  if (!scan.ok) throw new CandidateLoadFailure(scanRejectToError(scan))

  // Catastrophic-backtracking sniff. Runs as part of the static-scan stage
  // so a pathological regex from the proposer is rejected before any
  // strategy method executes. The per-method 5s Promise.race timeout in
  // `callStrategyMethodWithTimeout` cannot interrupt sync regex hangs
  // because the event loop itself is blocked — see the v1 caveat below.
  // Failure here flows through the evaluate callback's catch path as a
  // `phase: "candidate-rejected"` trajectory with the rejection reason in
  // feedback, which the proposer reads on the next iteration.
  const dosWarnings = sniffRegexDosRisk(input.text)
  if (dosWarnings.length > 0) {
    throw new CandidateLoadFailure({
      stage: "static-scan",
      reason: `regex DoS risk: ${dosWarnings.join("; ")}`,
    })
  }

  let bundled: string
  try {
    bundled = await compileTsToEsmJs(input)
  } catch (err) {
    throw new CandidateLoadFailure({
      stage: "compile",
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  let mod: Record<string, unknown>
  try {
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundled, "utf8").toString("base64")}`
    mod = (await import(dataUrl)) as Record<string, unknown>
  } catch (err) {
    throw new CandidateLoadFailure({
      stage: "import",
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  const exported = mod[input.exportName]
  if (exported === undefined || exported === null || typeof exported !== "object") {
    throw new CandidateLoadFailure({
      stage: "shape",
      reason: `Export "${input.exportName}" is missing or not an object after dynamic import.`,
    })
  }

  const shape = exported as Record<string, unknown>
  for (const name of REQUIRED_METHOD_NAMES) {
    if (typeof shape[name] !== "function") {
      throw new CandidateLoadFailure({
        stage: "shape",
        reason: `Export "${input.exportName}" does not have method "${name}". Got typeof ${typeof shape[name]}.`,
      })
    }
  }

  return {
    shape: shape as unknown as QueueStrategy,
    cleanup: async () => {
      // v1: no-op. The data: URL has no resource to release; the module is
      // GC'd when no references remain (cache holds the only reference,
      // released by `cleanupAllCandidates`). v2 will terminate the worker
      // here.
    },
  }
}

const compileTsToEsmJs = async (input: {
  readonly text: string
  readonly context: PackageContext
}): Promise<string> => {
  const result = await esbuild.build({
    stdin: {
      contents: input.text,
      resolveDir: dirname(input.context.strategyFilePath),
      sourcefile: input.context.strategyFilePath,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false,
    logLevel: "silent",
    legalComments: "none",
    treeShaking: true,
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.text).join("\n"))
  }
  const out = result.outputFiles?.[0]
  if (out === undefined) throw new Error("esbuild produced no output files")
  return out.text
}

const scanRejectToError = (scan: ScanReject): CandidateLoadError => ({
  stage: "static-scan",
  reason: scan.reason,
})

export const cleanupAllCandidates = async (): Promise<void> => {
  const pending: Promise<void>[] = []
  for (const promise of cache.values()) {
    pending.push(
      (async () => {
        try {
          const loaded = await promise
          await loaded.cleanup()
        } catch {
          // Failed candidates have nothing to clean up.
        }
      })(),
    )
  }
  await Promise.all(pending)
  cache.clear()
}

/**
 * Per-method async timeout wrapper. Wraps each strategy method so a hung
 * Promise-returning candidate (e.g. one that returns a never-settling
 * Promise from `buildPrompt`) trips the timeout instead of stalling
 * evaluation. Sync hangs (catastrophic regex backtracking) still block the
 * event loop — that's the v1 caveat documented in the spec; v2 fixes it
 * via `worker.terminate()`.
 *
 * The wrapper is permissive: if the method returns a primitive (the typical
 * sync case), the race resolves immediately on `Promise.resolve(value)`.
 */
export class StrategyMethodTimeoutError extends Error {
  readonly method: string
  readonly timeoutMs: number

  constructor(method: string, timeoutMs: number) {
    super(`strategy.${method} did not complete within ${timeoutMs}ms`)
    this.name = "StrategyMethodTimeoutError"
    this.method = method
    this.timeoutMs = timeoutMs
  }
}

export const callStrategyMethodWithTimeout = async <T>(input: {
  readonly method: string
  readonly invoke: () => T | Promise<T>
  readonly timeoutMs: number
}): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StrategyMethodTimeoutError(input.method, input.timeoutMs)), input.timeoutMs)
  })
  try {
    const value = await Promise.race([Promise.resolve().then(() => input.invoke()), timeout])
    return value
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
