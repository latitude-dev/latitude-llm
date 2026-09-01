import { createHash } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
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
const stateDir = () => process.env.LATITUDE_CLAUDE_CODE_STATE_DIR || join(homedir(), ".claude", "state", "latitude")
const stateFile = () => join(stateDir(), "state.json")
const lockFile = () => join(stateDir(), "state.lock")
const LOCK_TIMEOUT_MS = 2_000
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
    const all = readAll()
    all[key] = { ...state, updated: new Date().toISOString() }
    const tmp = `${stateFile()}.tmp`
    writeFileSync(tmp, JSON.stringify(all, null, 2), "utf-8")
    renameSync(tmp, stateFile())
  } catch {
    // fail-open
  }
}

export async function withLock<T>(fn: () => Promise<T> | T, onBusy?: () => void): Promise<T | undefined> {
  ensureDir()
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let fd: number | undefined
  while (Date.now() < deadline) {
    try {
      fd = openSync(lockFile(), "wx")
      break
    } catch {
      breakStaleLock()
      await sleep(50)
    }
  }
  // Skip rather than proceed unlocked. Two hooks can run against one session at once
  // — an async Stop worker still uploading when SessionEnd fires at quit — and a
  // single POST may take 30s against this 2s wait. Running anyway would re-send the
  // same deterministic spans before the offset advanced, and `traces_mv` is a
  // per-insert GROUP BY with no dedup, so the trace rollups would inflate. The holder
  // advances the offset; whatever this run would have shipped is picked up by the
  // next hook, and an abandoned lock is broken by age.
  if (fd === undefined) {
    onBusy?.()
    return undefined
  }
  try {
    return await fn()
  } finally {
    try {
      closeSync(fd)
    } catch {
      // ignore
    }
    try {
      unlinkSync(lockFile())
    } catch {
      // already gone
    }
  }
}

function breakStaleLock(): void {
  try {
    const age = Date.now() - statSync(lockFile()).mtimeMs
    if (age > LOCK_STALE_MS) unlinkSync(lockFile())
  } catch {
    // lock vanished between the failed acquire and now — fine
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
