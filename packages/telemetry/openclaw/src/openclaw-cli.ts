import { type SpawnSyncReturns, spawnSync } from "node:child_process"

/**
 * Lowest OpenClaw version we support. The reporter verified hook-dispatch
 * gating works correctly here; older versions either reject
 * `hooks.allowConversationAccess` outright (≤ 2026.4.21) or have unverified
 * gating behaviour (2026.4.22 – 2026.4.24). Refusing to install on older
 * versions is intentional — we'd rather fail loudly than ship a
 * config the gateway will quarantine or hooks the dispatcher will block.
 */
export const MIN_OPENCLAW_VERSION = "2026.4.25"

const DEFAULT_TIMEOUT_MS = 10_000

type RunResult =
  | { ok: true; stdout: string; stderr: string; code: 0 }
  | { ok: false; reason: "enoent"; stdout: ""; stderr: ""; code: null }
  | { ok: false; reason: "timeout"; stdout: string; stderr: string; code: null }
  | { ok: false; reason: "exit"; stdout: string; stderr: string; code: number }

/**
 * Spawn `openclaw <args>` synchronously. Reports failure modes structurally so
 * callers can decide how to degrade (missing binary vs. timed out vs. exited
 * non-zero). Never throws; ENOENT becomes `{ reason: "enoent" }`.
 */
export function runOpenclaw(args: string[], opts: { timeoutMs?: number; stdin?: string } = {}): RunResult {
  const result: SpawnSyncReturns<string> = spawnSync("openclaw", args, {
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    input: opts.stdin,
    // Inherit env so the user's PATH and any LATITUDE_* / OPENCLAW_* vars
    // reach the child process. We don't need a TTY — install is non-interactive.
    stdio: ["pipe", "pipe", "pipe"],
  })

  // spawnSync surfaces I/O errors through `result.error` rather than a thrown
  // exception when called this way. Order matters: a timeout shows up as
  // `error.code === "ETIMEDOUT"` AND/OR `signal === "SIGTERM"|"SIGKILL"`
  // depending on platform — classify it before the generic `if (err)`
  // catch-all so callers reliably get `reason: "timeout"` (and the
  // timeout-specific error messages in setup.ts aren't dead code).
  const err = result.error as (NodeJS.ErrnoException & { code?: string }) | undefined
  if (err?.code === "ENOENT") {
    return { ok: false, reason: "enoent", stdout: "", stderr: "", code: null }
  }
  if (err?.code === "ETIMEDOUT" || result.signal === "SIGTERM" || result.signal === "SIGKILL") {
    return {
      ok: false,
      reason: "timeout",
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: null,
    }
  }
  if (err) {
    // Treat any other spawn error as an unparseable exit failure.
    return {
      ok: false,
      reason: "exit",
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? String(err),
      code: typeof result.status === "number" ? result.status : 1,
    }
  }

  if (result.status === 0) {
    return { ok: true, stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: 0 }
  }

  return {
    ok: false,
    reason: "exit",
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: typeof result.status === "number" ? result.status : 1,
  }
}

type VersionLookup =
  | { ok: true; version: string; raw: string }
  | { ok: false; error: "missing" | "unparseable"; raw?: string | undefined }

/**
 * Run `openclaw --version` and parse out the version string.
 *
 * Banner format (per OpenClaw `src/cli/banner.ts` `formatCliBannerLine`):
 *   `🦞 OpenClaw <version> (<commit-sha>)`
 *
 * The banner is normally suppressed when `--version` is the flag, but the
 * version itself still goes to stdout. We accept either layout (with or
 * without the lobster + commit sha) so we don't break if OpenClaw later
 * prints just the bare version string.
 */
export function getOpenclawVersion(): VersionLookup {
  const result = runOpenclaw(["--version"], { timeoutMs: 5_000 })
  if (!result.ok) {
    if (result.reason === "enoent") return { ok: false, error: "missing" }
    return { ok: false, error: "unparseable", raw: result.stdout || result.stderr }
  }

  const raw = result.stdout.trim()
  // Match a CalVer triple anywhere in the output. Be liberal — banner
  // decorations (emoji, "OpenClaw" prefix, trailing "(sha)") all just
  // surround a single `YYYY.M.PATCH` somewhere.
  const match = raw.match(/(\d{4}\.\d+\.\d+)/)
  if (!match) return { ok: false, error: "unparseable", raw }
  return { ok: true, version: match[1] as string, raw }
}

/**
 * Compare two CalVer strings (`YYYY.M.PATCH`). Returns -1 if `a` < `b`,
 * 0 if equal, 1 if `a` > `b`. Strings with extra components or non-numeric
 * pieces fall back to a per-component string comparison so unexpected
 * formats don't crash the installer.
 */
export function compareCalver(a: string, b: string): -1 | 0 | 1 {
  const ap = a.split(".")
  const bp = b.split(".")
  const len = Math.max(ap.length, bp.length)
  for (let i = 0; i < len; i++) {
    const ai = ap[i] ?? "0"
    const bi = bp[i] ?? "0"
    const an = Number(ai)
    const bn = Number(bi)
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      if (an < bn) return -1
      if (an > bn) return 1
      continue
    }
    if (ai < bi) return -1
    if (ai > bi) return 1
  }
  return 0
}
