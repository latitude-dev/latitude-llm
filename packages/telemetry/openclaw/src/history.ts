import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, dirname, join } from "node:path"
import { type Message, normalizeMessages } from "./messages.ts"

/**
 * Conversation history for harnesses that do not hand it to plugins. The
 * embedded runner passes the whole session on `llm_input.historyMessages` and
 * on `agent_end.messages`; the Codex harness owns the thread itself and passes
 * an empty history and a per-turn transcript. The plugin then rebuilds the
 * session from the turns it has seen, and on a cold start from OpenClaw's own
 * transcript store: the per-agent SQLite database (2026.9+) or the older
 * JSONL file under `<stateDir>/agents/<agent>/sessions/`.
 */

const MAX_MESSAGES = 400
const MAX_SESSIONS = 200
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_FILE_BYTES = 8 * 1024 * 1024
const CURRENT_PROMPT_WINDOW_MS = 60_000

export type TranscriptReader = (path: string) => string | undefined

const defaultTranscriptReader: TranscriptReader = (path) => {
  try {
    const content = readFileSync(path, "utf8")
    return content.length > MAX_FILE_BYTES ? undefined : content
  } catch {
    return undefined
  }
}

interface SessionHistory {
  messages: Message[]
  updatedAt: number
}

export class SessionHistoryStore {
  private readonly sessions = new Map<string, SessionHistory>()
  private readonly now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  get(sessionId: string): Message[] | undefined {
    const entry = this.sessions.get(sessionId)
    if (!entry) return undefined
    entry.updatedAt = this.now()
    return entry.messages
  }

  /** Replace the session's history with a full transcript the harness supplied. */
  replace(sessionId: string, messages: readonly Message[]): void {
    this.set(sessionId, messages.slice(-MAX_MESSAGES))
  }

  /** Extend the session's history with one turn's new messages. */
  append(sessionId: string, base: readonly Message[], turn: readonly Message[]): void {
    this.set(sessionId, [...base, ...turn].slice(-MAX_MESSAGES))
  }

  forget(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  private set(sessionId: string, messages: Message[]): void {
    this.evict()
    this.sessions.set(sessionId, { messages, updatedAt: this.now() })
  }

  private evict(): void {
    const now = this.now()
    for (const [id, entry] of this.sessions) {
      if (now - entry.updatedAt > SESSION_TTL_MS) this.sessions.delete(id)
    }
    if (this.sessions.size < MAX_SESSIONS) return
    const oldest = Array.from(this.sessions.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    for (const [id] of oldest.slice(0, this.sessions.size - MAX_SESSIONS + 1)) this.sessions.delete(id)
  }
}

/** The default workspace is `<stateDir>/workspace`, which is the only structural clue a run carries. */
export function stateDirFromWorkspace(workspaceDir: string | undefined): string | undefined {
  if (!workspaceDir) return undefined
  return basename(workspaceDir) === "workspace" ? dirname(workspaceDir) : undefined
}

export function sessionTranscriptPath(stateDir: string, agentId: string, sessionId: string): string {
  return join(stateDir, "agents", agentId, "sessions", `${sessionId}.jsonl`)
}

export function agentDatabasePath(stateDir: string, agentId: string): string {
  return join(stateDir, "agents", agentId, "agent", "openclaw-agent.sqlite")
}

/** Rows of `event_json` for a session, active branch first, else every event in order. */
export type TranscriptRowsReader = (dbPath: string, sessionId: string) => string[] | undefined

interface SqliteLike {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
  close(): void
}

/**
 * Reads through `node:sqlite` (Node 22.13+), loaded lazily so a host without
 * it degrades to "no history" instead of failing to load the plugin. The
 * database is opened read-only; the gateway keeps its own writer open.
 */
const defaultTranscriptRowsReader: TranscriptRowsReader = (dbPath, sessionId) => {
  let db: SqliteLike
  try {
    const require = createRequire(import.meta.url)
    const sqlite = require("node:sqlite") as {
      DatabaseSync: new (path: string, opts: { readOnly: boolean }) => SqliteLike
    }
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return undefined
  }
  try {
    const active = db
      .prepare(
        `SELECT e.event_json AS event_json
           FROM session_transcript_active_events a
           JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
          WHERE a.session_id = ?
          ORDER BY a.active_position`,
      )
      .all(sessionId)
    const rows =
      active.length > 0
        ? active
        : db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq").all(sessionId)
    return rows
      .map((row) => (row && typeof row === "object" ? (row as { event_json?: unknown }).event_json : undefined))
      .filter((v): v is string => typeof v === "string")
  } catch {
    return undefined
  } finally {
    try {
      db.close()
    } catch {
      // already closed
    }
  }
}

export interface CompactionRecord {
  summary: string
  tokensBefore: number | undefined
  tokensAfter: number | undefined
}

/**
 * The latest compaction entry of a session. `after_compaction` reports only
 * counts; the summary that replaced the compacted messages lives in the
 * transcript store, written before the hook fires.
 */
export function readLatestCompaction(
  dbPath: string,
  sessionId: string,
  readRows: TranscriptRowsReader = defaultTranscriptRowsReader,
): CompactionRecord | undefined {
  const rows = readRows(dbPath, sessionId)
  return rows ? latestCompactionFromEntries(rows) : undefined
}

export function readLatestCompactionFromFile(
  path: string,
  read: TranscriptReader = defaultTranscriptReader,
): CompactionRecord | undefined {
  const raw = read(path)
  return raw === undefined ? undefined : latestCompactionFromEntries(raw.split("\n"))
}

function latestCompactionFromEntries(lines: readonly string[]): CompactionRecord | undefined {
  let latest: CompactionRecord | undefined
  for (const line of lines) {
    if (!line.includes('"compaction"')) continue
    let entry: TranscriptEntry & { tokensBefore?: unknown; tokensAfter?: unknown }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!entry || entry.type !== "compaction" || typeof entry.summary !== "string") continue
    latest = {
      summary: entry.summary,
      tokensBefore: typeof entry.tokensBefore === "number" ? entry.tokensBefore : undefined,
      tokensAfter: typeof entry.tokensAfter === "number" ? entry.tokensAfter : undefined,
    }
  }
  return latest
}

/** The session's visible conversation from the agent database, oldest first. */
export function readSessionTranscriptFromDatabase(
  dbPath: string,
  sessionId: string,
  readRows: TranscriptRowsReader = defaultTranscriptRowsReader,
): StoredMessage[] | undefined {
  const rows = readRows(dbPath, sessionId)
  if (!rows) return undefined
  return messagesFromEntries(rows)
}

/** A stored transcript message with the time it was persisted, when the entry recorded one. */
interface StoredMessage {
  message: Message
  timestamp: number | undefined
}

/**
 * The current prompt is usually persisted before `llm_input` fires, so the
 * stored transcript ends with it. Channels wrap the prompt in an envelope
 * (conversation info, system lines) before the model sees it, so the stored
 * text is matched by containment; a very recent trailing user message with no
 * text match is dropped as well.
 */
export function withoutCurrentPrompt(
  stored: StoredMessage[],
  prompt: string | undefined,
  runStartMs: number,
): Message[] {
  const kept = [...stored]
  for (let i = 0; i < 3 && kept.length > 0; i++) {
    const last = kept[kept.length - 1] as StoredMessage
    if (last.message.role !== "user") break
    const text = last.message.parts
      .map((p) => (typeof p.content === "string" ? p.content : ""))
      .join("\n")
      .trim()
    const textMatches = text.length > 0 && prompt !== undefined && (prompt === text || prompt.includes(text))
    const recent = last.timestamp !== undefined && Math.abs(runStartMs - last.timestamp) <= CURRENT_PROMPT_WINDOW_MS
    if (!textMatches && !recent) break
    kept.pop()
  }
  return kept.map((m) => m.message)
}

interface TranscriptEntry {
  type?: string
  id?: string
  parentId?: string | null
  timestamp?: unknown
  message?: unknown
  summary?: unknown
}

/**
 * OpenClaw's transcript is a JSONL tree of entries; the visible conversation is
 * the parent chain of the last message entry (compaction and reset entries
 * branch it). Returns the normalized messages, oldest first.
 */
export function readSessionTranscript(
  path: string,
  read: TranscriptReader = defaultTranscriptReader,
): StoredMessage[] | undefined {
  const raw = read(path)
  if (raw === undefined) return undefined
  return messagesFromEntries(raw.split("\n"))
}

function messagesFromEntries(lines: readonly string[]): StoredMessage[] {
  const byId = new Map<string, TranscriptEntry>()
  let last: TranscriptEntry | undefined
  for (const line of lines) {
    if (line.trim().length === 0) continue
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line) as TranscriptEntry
    } catch {
      continue
    }
    if (!entry || typeof entry !== "object") continue
    if (typeof entry.id === "string") byId.set(entry.id, entry)
    if (entry.type === "message" && entry.message) last = entry
  }
  if (!last) return []
  const chain: TranscriptEntry[] = []
  const seen = new Set<string>()
  let cursor: TranscriptEntry | undefined = last
  while (cursor && chain.length < MAX_MESSAGES) {
    if (cursor.type === "message" && cursor.message) chain.push(cursor)
    // A compaction entry summarizes everything above it; that is where the model's view starts.
    if (cursor.type === "compaction") {
      if (typeof cursor.summary === "string" && cursor.summary.length > 0) {
        chain.push({ type: "message", message: { role: "user", content: `[compaction summary] ${cursor.summary}` } })
      }
      break
    }
    const parentId = cursor.parentId
    if (!parentId || seen.has(parentId)) break
    seen.add(parentId)
    cursor = byId.get(parentId)
  }
  chain.reverse()
  const out: StoredMessage[] = []
  for (const entry of chain) {
    const [message] = normalizeMessages([entry.message])
    if (message) out.push({ message, timestamp: entryTimestamp(entry) })
  }
  return out
}

function entryTimestamp(entry: TranscriptEntry): number | undefined {
  const inner = (entry.message as { timestamp?: unknown } | undefined)?.timestamp
  if (typeof inner === "number") return inner
  if (typeof entry.timestamp === "string") {
    const parsed = Date.parse(entry.timestamp)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}
