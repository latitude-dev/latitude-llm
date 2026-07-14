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

const STATE_DIR = join(homedir(), ".claude", "state", "latitude")
const STATE_FILE = join(STATE_DIR, "state.json")
const LOCK_FILE = join(STATE_DIR, "state.lock")
const LOCK_TIMEOUT_MS = 2_000
// A hook killed mid-run (e.g. by Claude Code's hook timeout) leaves its lock file
// behind; anything older than this is treated as abandoned and broken.
const LOCK_STALE_MS = 10 * 60_000

interface SessionState {
  offset: number
  buffer: string
  turnCount: number
  traceId?: string | undefined
  // Main-session entries only: accumulated parent Agent tool_use -> span links,
  // keyed by toolUseId (and promptId as a fallback), so subagents can re-parent on
  // later turns.
  agentLinks?: Record<string, { traceId: string; parentSpanId: string }> | undefined
  // Subagent-file entries only: file size at last emission, so a subagent's spans
  // are re-emitted only when its transcript grows (e.g. the late final synthesis).
  emittedSize?: number | undefined
  updated?: string | undefined
}

type StateMap = Record<string, SessionState>

export function stateKey(sessionId: string, transcriptPath: string): string {
  return createHash("sha256").update(`${sessionId}::${transcriptPath}`).digest("hex")
}

export function load(key: string): SessionState {
  try {
    if (!existsSync(STATE_FILE)) return empty()
    const raw = readFileSync(STATE_FILE, "utf-8")
    const all = JSON.parse(raw) as StateMap
    const entry = all[key]
    if (!entry) return empty()
    return {
      offset: Number(entry.offset) || 0,
      buffer: typeof entry.buffer === "string" ? entry.buffer : "",
      turnCount: Number(entry.turnCount) || 0,
      traceId: typeof entry.traceId === "string" ? entry.traceId : undefined,
      agentLinks: entry.agentLinks && typeof entry.agentLinks === "object" ? entry.agentLinks : undefined,
      emittedSize: typeof entry.emittedSize === "number" ? entry.emittedSize : undefined,
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
    const tmp = `${STATE_FILE}.tmp`
    writeFileSync(tmp, JSON.stringify(all, null, 2), "utf-8")
    renameSync(tmp, STATE_FILE)
  } catch {
    // fail-open
  }
}

export async function withLock<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
  ensureDir()
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let fd: number | undefined
  while (Date.now() < deadline) {
    try {
      fd = openSync(LOCK_FILE, "wx")
      break
    } catch {
      breakStaleLock()
      await sleep(50)
    }
  }
  try {
    return await fn()
  } finally {
    // Only release the lock we actually acquired — when the wait timed out and we
    // proceeded anyway, the file belongs to another hook run still in flight.
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // ignore
      }
      try {
        unlinkSync(LOCK_FILE)
      } catch {
        // already gone
      }
    }
  }
}

function breakStaleLock(): void {
  try {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs
    if (age > LOCK_STALE_MS) unlinkSync(LOCK_FILE)
  } catch {
    // lock vanished between the failed acquire and now — fine
  }
}

function readAll(): StateMap {
  try {
    if (!existsSync(STATE_FILE)) return {}
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as StateMap
  } catch {
    return {}
  }
}

function ensureDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
}

function empty(): SessionState {
  return { offset: 0, buffer: "", turnCount: 0 }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
