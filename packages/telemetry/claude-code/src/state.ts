import { createHash } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const STATE_DIR = join(homedir(), ".claude", "state", "latitude")
const STATE_FILE = join(STATE_DIR, "state.json")
const LOCK_FILE = join(STATE_DIR, "state.lock")
const LOCK_TIMEOUT_MS = 2_000

interface SessionState {
  offset: number
  buffer: string
  turnCount: number
  traceId?: string | undefined
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
      await sleep(50)
    }
  }
  try {
    return await fn()
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // ignore
      }
    }
    try {
      unlinkSync(LOCK_FILE)
    } catch {
      // lock was never acquired or already gone
    }
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
