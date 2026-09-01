import { createHash } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// Overridable so a test never writes to — or locks — the real state a live session
// is using. Read per call rather than captured, so a test can point it elsewhere.
const lockToken = () => `${process.pid}`
const stateDir = () => process.env.LATITUDE_CLAUDE_CODE_STATE_DIR || join(homedir(), ".claude", "state", "latitude")
const stateFile = () => join(stateDir(), "state.json")
const lockFile = (name: string) => join(stateDir(), `${name}.lock`)
const STATE_WRITE_LOCK = "state-write"
const LOCK_TIMEOUT_MS = 2_000
// The state write is a read-modify-write of one small file; contention clears in
// milliseconds, so this only has to outlast a scheduling hiccup.
const STATE_WRITE_LOCK_TIMEOUT_MS = 250
// Returned when the filesystem cannot lock at all, so the caller proceeds and the
// release path knows there is nothing to unlink.
const LOCK_UNAVAILABLE = -1
// A hook killed mid-run (e.g. by Claude Code's hook timeout) leaves its lock file
// behind; anything older than this is treated as abandoned and broken.
const LOCK_STALE_MS = 10 * 60_000

export interface SessionState {
  offset: number
  buffer: string
  turnCount: number
  traceId?: string | undefined
  // Main-session entries only: the inherited trace this session joined (see
  // inherited-context.ts) and how many spans it has contributed to it. The count
  // caps how far one interactive session may grow a trace it does not own.
  inheritedTraceId?: string | undefined
  inheritedSpanCount?: number | undefined
  // Main-session entries only: accumulated parent Agent tool_use -> span links,
  // keyed by toolUseId (and promptId as a fallback), so subagents can re-parent on
  // later turns.
  agentLinks?: Record<string, { traceId: string; parentSpanId: string }> | undefined
  // Subagent-file entries only: incremental emission progress. Each subagent span
  // is emitted exactly once (the trace-level aggregates are additive per insert, so
  // re-sending would double-count). `emittedCalls` is how many of the subagent's
  // calls have been emitted, `interactionEmitted` whether its interaction span has,
  // `lastSize` the file size at the previous Stop (a growth check gates the trailing
  // call until the transcript settles), and `subDone` marks it fully emitted.
  emittedCalls?: number | undefined
  interactionEmitted?: boolean | undefined
  lastSize?: number | undefined
  subDone?: boolean | undefined
  updated?: string | undefined
}

type StateMap = Record<string, SessionState>

export function stateKey(sessionId: string, transcriptPath: string): string {
  return createHash("sha256").update(`${sessionId}::${transcriptPath}`).digest("hex")
}

export function load(key: string): SessionState {
  try {
    if (!existsSync(stateFile())) return empty()
    const raw = readFileSync(stateFile(), "utf-8")
    const all = JSON.parse(raw) as StateMap
    const entry = all[key]
    if (!entry) return empty()
    return {
      offset: Number(entry.offset) || 0,
      buffer: typeof entry.buffer === "string" ? entry.buffer : "",
      turnCount: Number(entry.turnCount) || 0,
      traceId: typeof entry.traceId === "string" ? entry.traceId : undefined,
      inheritedTraceId: typeof entry.inheritedTraceId === "string" ? entry.inheritedTraceId : undefined,
      inheritedSpanCount: typeof entry.inheritedSpanCount === "number" ? entry.inheritedSpanCount : undefined,
      agentLinks: entry.agentLinks && typeof entry.agentLinks === "object" ? entry.agentLinks : undefined,
      emittedCalls: typeof entry.emittedCalls === "number" ? entry.emittedCalls : undefined,
      interactionEmitted: typeof entry.interactionEmitted === "boolean" ? entry.interactionEmitted : undefined,
      lastSize: typeof entry.lastSize === "number" ? entry.lastSize : undefined,
      subDone: typeof entry.subDone === "boolean" ? entry.subDone : undefined,
    }
  } catch {
    return empty()
  }
}

export function save(key: string, state: SessionState): void {
  try {
    ensureDir()
    // The whole map is rewritten, so a concurrent save would drop this entry. Written
    // anyway on timeout: skipping the write re-emits this window on the next hook.
    const fd = acquireSync(STATE_WRITE_LOCK, STATE_WRITE_LOCK_TIMEOUT_MS)
    try {
      const all = readAll()
      all[key] = { ...state, updated: new Date().toISOString() }
      const tmp = `${stateFile()}.tmp`
      writeFileSync(tmp, JSON.stringify(all, null, 2), "utf-8")
      renameSync(tmp, stateFile())
    } finally {
      release(STATE_WRITE_LOCK, fd)
    }
  } catch {
    // fail-open
  }
}

// Per session, not global: a busy session would otherwise drop another's SessionEnd,
// which is the last hook that session ever gets.
export async function withLock<T>(key: string, fn: () => Promise<T> | T, onBusy?: () => void): Promise<T | undefined> {
  ensureDir()
  sweepAbandonedLocks()
  const fd = await acquire(key, LOCK_TIMEOUT_MS)
  if (fd === undefined) {
    onBusy?.()
    return undefined
  }
  try {
    return await fn()
  } finally {
    release(key, fd)
  }
}

async function acquire(name: string, timeoutMs: number): Promise<number | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const fd = tryOpen(name)
    if (fd !== undefined) return fd
    if (Date.now() >= deadline) return undefined
    breakStaleLock(name)
    await sleep(50)
  }
}

function acquireSync(name: string, timeoutMs: number): number | undefined {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const fd = tryOpen(name)
    if (fd !== undefined) return fd
    if (Date.now() >= deadline) return undefined
    breakStaleLock(name)
  }
}

// Only EEXIST is contention; any other error means locking is unavailable, so the
// caller runs unlocked rather than silently dropping telemetry.
function tryOpen(name: string): number | undefined {
  try {
    const fd = openSync(lockFile(name), "wx")
    writeFileSync(lockFile(name), lockToken(), "utf-8")
    return fd
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return undefined
    return LOCK_UNAVAILABLE
  }
}

function release(name: string, fd: number | undefined): void {
  if (fd === undefined || fd === LOCK_UNAVAILABLE) return
  try {
    closeSync(fd)
  } catch {
    // ignore
  }
  try {
    // Only ours: a batch slower than LOCK_STALE_MS can have its lock broken and
    // retaken, and unlinking by path alone would then delete the new holder's.
    if (readFileSync(lockFile(name), "utf-8") === lockToken()) unlinkSync(lockFile(name))
  } catch {
    // already gone, or not ours
  }
}

function breakStaleLock(name: string): void {
  try {
    const age = Date.now() - statSync(lockFile(name)).mtimeMs
    if (age > LOCK_STALE_MS) unlinkSync(lockFile(name))
  } catch {
    // lock vanished between the failed acquire and now — fine
  }
}

// A killed worker's lock is only broken when something contends for that exact
// session again, which for a finished session never happens.
function sweepAbandonedLocks(): void {
  try {
    for (const name of readdirSync(stateDir())) {
      if (name.endsWith(".lock")) breakStaleLock(name.slice(0, -".lock".length))
    }
  } catch {
    // best-effort
  }
}

function readAll(): StateMap {
  try {
    if (!existsSync(stateFile())) return {}
    return JSON.parse(readFileSync(stateFile(), "utf-8")) as StateMap
  } catch {
    return {}
  }
}

function ensureDir(): void {
  if (!existsSync(stateDir())) mkdirSync(stateDir(), { recursive: true })
}

function empty(): SessionState {
  return { offset: 0, buffer: "", turnCount: 0 }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
