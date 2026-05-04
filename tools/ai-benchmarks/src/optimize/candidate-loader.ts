import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import type { FlaggerStrategy } from "@domain/flaggers"
import esbuild from "esbuild"
import { type PackageContext, runStaticSafetyScan, type ScanReject, sniffRegexDosRisk } from "./safety-scan.ts"

/**
 * v1 candidate loader for `ts-module` candidates: static safety scan →
 * esbuild compile (workspace + npm deps externalized) → dynamic import via a
 * temp `.mjs` file in the strategy directory → shape probe.
 *
 * The temp-file dance instead of a `data:` URL is deliberate: data: URLs
 * have no parent location, so Node refuses to resolve bare imports (`effect`,
 * `@domain/spans`, ...) from them. Writing a small file inside the strategy
 * directory means Node walks up into the strategy package's `node_modules`
 * for those bare specifiers — the same resolution the original strategy
 * file uses — so esbuild can keep deps external and the bundle stays tiny.
 *
 * Why this matters: every dynamically imported module is permanently pinned
 * in Node's ESM loader cache (no public eviction API). On long optimizer
 * runs that pin is the dominant memory cost. Externalizing the heavy deps
 * shrinks each pin from megabytes to tens of kilobytes — a ~50× reduction
 * that buys the orchestrator orders of magnitude more iterations before it
 * OOMs. The leak is not eliminated; v2 (planned, see spec §"v2: Worker
 * isolation") swaps the dynamic-import step for a worker-thread spawn so
 * `worker.terminate()` can release the entire isolate (and hard-kill runaway
 * candidates). The external `loadFlaggerCandidate` API is the seam that
 * v2 swaps without changing callers.
 */

const REQUIRED_METHOD_NAMES = [
  "hasRequiredContext",
  "detectDeterministically",
  "buildSystemPrompt",
  "buildPrompt",
] as const

interface LoadedCandidate {
  readonly shape: FlaggerStrategy
  readonly cleanup: () => Promise<void>
}

interface BundleInfo {
  readonly inputBytes: number
  readonly outputBytes: number
  /**
   * Plain (no ANSI color) unified diff between the input strategy file and
   * the bundled output, produced by `git diff --no-index -U1`. Empty string
   * when there are no textual differences. Plain so the verbose log file
   * stays grep/cat-friendly; colorize at tail time if you want.
   */
  readonly diff: string
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
  /**
   * Optional sink for per-candidate bundle diagnostics. Fires once per
   * unique candidate hash (the in-memory cache dedupes repeat loads). The
   * orchestrator routes this to the verbose debug log so it doesn't fight
   * the live ink TUI.
   */
  readonly onBundle?: (info: BundleInfo) => void
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

  if (input.onBundle !== undefined) {
    input.onBundle({
      inputBytes: input.text.length,
      outputBytes: bundled.length,
      diff: computeBundleDiff(input.text, bundled),
    })
  }

  // Write the bundle to a temp `.mjs` file inside the strategy directory and
  // import via `file:` URL. We can't use a `data:` URL because data: URLs
  // have no parent location, so Node refuses to resolve bare specifiers
  // (`effect`, `@domain/spans`, ...) from them. That constraint is what
  // forced the previous version to bundle every workspace + npm dep inline,
  // producing MB-sized bundles that V8 then pinned forever in the ESM
  // loader cache once imported. With externalized deps + a file: URL,
  // resolution walks up from `flagger-strategies/` into the strategy
  // package's `node_modules`, the bundled output stays in the tens of KB,
  // and even though Node still pins each imported file in the loader cache
  // (no public API to evict), each pin is now ~50× smaller. The file
  // itself is deleted immediately after import — Node holds the module by
  // URL, not by the file's continued existence, so deletion is safe.
  const candidateDir = dirname(input.context.strategyFilePath)
  const candidatePath = join(candidateDir, `.candidate-${input.hash.slice(0, 16)}.mjs`)
  let mod: Record<string, unknown>
  try {
    try {
      await writeFile(candidatePath, bundled, "utf8")
      mod = (await import(pathToFileURL(candidatePath).href)) as Record<string, unknown>
    } catch (err) {
      throw new CandidateLoadFailure({
        stage: "import",
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  } finally {
    await unlink(candidatePath).catch(() => {})
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
    shape: shape as unknown as FlaggerStrategy,
    cleanup: async () => {
      // v1: no-op. The temp file is already unlinked in `compileAndImport`'s
      // finally block (immediately after import), and Node's ESM loader
      // cache pins the module by URL with no public eviction API. v2 will
      // terminate the worker here, releasing the entire isolate at once.
    },
  }
}

const compileTsToEsmJs = async (input: {
  readonly text: string
  readonly context: PackageContext
}): Promise<string> => {
  // Externalize workspace + npm deps (the same set the static scan
  // allows) so esbuild emits bare imports instead of inlining megabytes of
  // dependency code. The same module instances are then reused across
  // every candidate import — see the long comment in `compileAndImport`
  // for why this matters.
  //
  // Both `<spec>` and `<spec>/*` are listed because esbuild's external
  // matching is exact on the literal specifier; subpath imports like
  // `@domain/spans/foo` need their own entry. Relative imports (`./shared.ts`,
  // `./types.ts`) stay bundled — they're tiny and bundling them keeps the
  // candidate self-contained for resolution.
  const allowed = [...input.context.allowedSpecifiers]
  const external = [...allowed, ...allowed.map((s) => `${s}/*`)]
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
    external,
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.text).join("\n"))
  }
  const out = result.outputFiles?.[0]
  if (out === undefined) throw new Error("esbuild produced no output files")
  return out.text
}

/**
 * Plain unified diff between input and bundled output. Shells out to
 * `git diff --no-index` because (a) it's universally available, (b) the
 * `+`/`-` line prefixes are unambiguous without ANSI color, keeping the
 * verbose log file grep/cat-friendly. Tail-time colorizers (e.g.
 * `bat -l diff` or a `sed` filter) handle the live-color use case.
 */
const computeBundleDiff = (inputText: string, outputText: string): string => {
  const tmp = mkdtempSync(join(tmpdir(), "candidate-diff-"))
  try {
    const inPath = join(tmp, "input.ts")
    const outPath = join(tmp, "bundle.mjs")
    writeFileSync(inPath, inputText)
    writeFileSync(outPath, outputText)
    const result = spawnSync("git", ["diff", "--no-index", "--no-prefix", "-U1", "--", inPath, outPath], {
      encoding: "utf8",
    })
    return result.stdout ?? ""
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
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
