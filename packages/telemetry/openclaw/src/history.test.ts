import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  readLatestCompaction,
  readLatestCompactionFromFile,
  readSessionTranscript,
  readSessionTranscriptFromDatabase,
  SessionHistoryStore,
  sessionTranscriptPath,
  stateDirFromWorkspace,
  withoutCurrentPrompt,
} from "./history.ts"

const line = (entry: unknown) => JSON.stringify(entry)

describe("readSessionTranscript", () => {
  it("walks the parent chain of the last message and stops at a compaction summary", () => {
    const raw = [
      line({ type: "session", id: "s", parentId: null }),
      line({ type: "message", id: "m1", parentId: "s", message: { role: "user", content: "very old" } }),
      line({ type: "compaction", id: "c1", parentId: "m1", summary: "we discussed teal" }),
      line({ type: "message", id: "m2", parentId: "c1", message: { role: "user", content: "after" } }),
      line({
        type: "message",
        id: "m3",
        parentId: "m2",
        message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
      }),
      "not json",
      "",
    ].join("\n")
    const messages = readSessionTranscript("/p", () => raw)
    expect(messages?.map(({ message: m }) => `${m.role}:${m.parts[0]?.content}`)).toEqual([
      "user:[compaction summary] we discussed teal",
      "user:after",
      "assistant:ok",
    ])
  })

  it("returns undefined when the file is unreadable and an empty list when it has no messages", () => {
    expect(readSessionTranscript("/p", () => undefined)).toBeUndefined()
    expect(readSessionTranscript("/p", () => line({ type: "session", id: "s" }))).toEqual([])
  })
})

describe("paths", () => {
  it("derives the state dir only from the default workspace layout", () => {
    expect(stateDirFromWorkspace("/home/u/.openclaw/workspace")).toBe("/home/u/.openclaw")
    expect(stateDirFromWorkspace("/srv/agent-ws")).toBeUndefined()
    expect(sessionTranscriptPath("/home/u/.openclaw", "main", "abc")).toBe(
      "/home/u/.openclaw/agents/main/sessions/abc.jsonl",
    )
  })
})

describe("withoutCurrentPrompt", () => {
  const user = (content: string, timestamp?: number) => ({
    message: { role: "user" as const, parts: [{ type: "text", content }] },
    timestamp,
  })
  const assistant = (content: string) => ({
    message: { role: "assistant" as const, parts: [{ type: "text", content }] },
    timestamp: 1,
  })

  it("drops a trailing user message the channel wrapped in an envelope", () => {
    const stored = [user("earlier", 1), assistant("ok"), user("are you there?", 5_000)]
    const kept = withoutCurrentPrompt(
      stored,
      "Conversation info: {...}\n\nSystem: Slack DM from Alex\n\nare you there?",
      100_000,
    )
    expect(kept.map((m) => m.parts[0]?.content)).toEqual(["earlier", "ok"])
  })

  it("drops a very recent trailing user message even when the text differs", () => {
    const stored = [user("earlier", 1), assistant("ok"), user("[context] hi", 99_500)]
    expect(withoutCurrentPrompt(stored, "hi there", 100_000).map((m) => m.parts[0]?.content)).toEqual(["earlier", "ok"])
  })

  it("keeps an old unrelated trailing user message", () => {
    const stored = [user("earlier", 1), assistant("ok"), user("unanswered", 5_000)]
    expect(withoutCurrentPrompt(stored, "something else", 100_000)).toHaveLength(3)
  })
})

describe("SessionHistoryStore", () => {
  it("appends turns, replaces on a full transcript and forgets", () => {
    let now = 0
    const store = new SessionHistoryStore(() => now)
    const msg = (content: string) => ({ role: "user" as const, parts: [{ type: "text", content }] })
    store.append("s", [], [msg("a")])
    store.append("s", store.get("s") ?? [], [msg("b")])
    expect(store.get("s")?.map((m) => m.parts[0]?.content)).toEqual(["a", "b"])
    store.replace("s", [msg("z")])
    expect(store.get("s")?.map((m) => m.parts[0]?.content)).toEqual(["z"])
    now = 25 * 60 * 60 * 1000
    store.append("other", [], [msg("x")])
    expect(store.get("s")).toBeUndefined()
    store.forget("other")
    expect(store.get("other")).toBeUndefined()
  })
})

describe("readSessionTranscriptFromDatabase", () => {
  it("prefers the active branch and parses the same entry shape as the JSONL file", () => {
    const rows = [
      line({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "q1" } }),
      line({
        type: "message",
        id: "m2",
        parentId: "m1",
        message: { role: "assistant", content: [{ type: "text", text: "a1" }] },
      }),
    ]
    const messages = readSessionTranscriptFromDatabase("/db", "sess", (dbPath, sessionId) =>
      dbPath === "/db" && sessionId === "sess" ? rows : undefined,
    )
    expect(messages?.map(({ message: m }) => `${m.role}:${m.parts[0]?.content}`)).toEqual(["user:q1", "assistant:a1"])
    expect(readSessionTranscriptFromDatabase("/db", "other", () => undefined)).toBeUndefined()
  })

  it("reads a real agent database through node:sqlite", async () => {
    const { DatabaseSync } = (await import("node:sqlite")) as {
      DatabaseSync: new (
        path: string,
      ) => { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown }; close(): void }
    }
    const dir = mkdtempSync(join(tmpdir(), "oc-agent-db-"))
    const dbPath = join(dir, "openclaw-agent.sqlite")
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE transcript_events (session_id TEXT NOT NULL, seq INTEGER NOT NULL, event_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (session_id, seq));
      CREATE TABLE session_transcript_active_events (session_id TEXT NOT NULL, active_position INTEGER NOT NULL, event_seq INTEGER NOT NULL, message_position INTEGER, context_eligible INTEGER, PRIMARY KEY (session_id, active_position));
    `)
    const insertEvent = db.prepare("INSERT INTO transcript_events VALUES (?, ?, ?, ?)")
    const insertActive = db.prepare("INSERT INTO session_transcript_active_events VALUES (?, ?, ?, ?, NULL)")
    const events = [
      { type: "message", id: "m1", parentId: null, message: { role: "user", content: "old" } },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        message: { role: "assistant", content: [{ type: "text", text: "abandoned branch" }] },
      },
      {
        type: "message",
        id: "m3",
        parentId: "m1",
        message: { role: "assistant", content: [{ type: "text", text: "kept" }] },
      },
    ]
    events.forEach((e, i) => {
      insertEvent.run("sess", i + 1, JSON.stringify(e), 1)
    })
    insertActive.run("sess", 0, 1, 0)
    insertActive.run("sess", 1, 3, 1)
    db.close()

    const messages = readSessionTranscriptFromDatabase(dbPath, "sess")
    expect(messages?.map(({ message }) => message.parts[0]?.content)).toEqual(["old", "kept"])
    expect(readSessionTranscriptFromDatabase(dbPath, "missing")).toEqual([])
    expect(readSessionTranscriptFromDatabase(join(dir, "nope.sqlite"), "sess")).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("readLatestCompaction", () => {
  const rows = [
    line({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "q" } }),
    line({ type: "compaction", id: "c1", parentId: "m1", summary: "first", tokensBefore: 10, tokensAfter: 2 }),
    line({ type: "compaction", id: "c2", parentId: "c1", summary: "second" }),
  ]

  it("returns the last compaction entry from the database rows and from the file", () => {
    expect(readLatestCompaction("/db", "s", () => rows)).toEqual({
      summary: "second",
      tokensBefore: undefined,
      tokensAfter: undefined,
    })
    expect(readLatestCompactionFromFile("/f", () => rows.slice(0, 2).join("\n"))).toEqual({
      summary: "first",
      tokensBefore: 10,
      tokensAfter: 2,
    })
    expect(readLatestCompaction("/db", "s", () => undefined)).toBeUndefined()
    expect(readLatestCompaction("/db", "s", () => [rows[0] as string])).toBeUndefined()
  })
})
