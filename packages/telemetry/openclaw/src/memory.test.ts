import { describe, expect, it } from "vitest"
import { memoryEventsFromToolCall, memoryRecordId, memorySnapshot } from "./memory.ts"

const reader = (files: Record<string, string>) => (path: string) => files[path]

describe("memoryRecordId", () => {
  it("accepts the built-in store files and memory/ notes relative to the workspace", () => {
    expect(memoryRecordId("MEMORY.md", "/ws")).toBe("MEMORY.md")
    expect(memoryRecordId("/ws/USER.md", "/ws")).toBe("USER.md")
    expect(memoryRecordId("memory/2026-09-09.md", "/ws")).toBe("memory/2026-09-09.md")
    expect(memoryRecordId("./memory/notes/x.md", "/ws")).toBe("memory/notes/x.md")
  })

  it("rejects everything else", () => {
    expect(memoryRecordId("src/app.ts", "/ws")).toBeUndefined()
    expect(memoryRecordId("memory/data.json", "/ws")).toBeUndefined()
    expect(memoryRecordId("../other/MEMORY.md", "/ws")).toBeUndefined()
    expect(memoryRecordId("MEMORY.md", undefined)).toBeUndefined()
  })
})

describe("memoryEventsFromToolCall", () => {
  it("maps memory_get to a single-record read", () => {
    const [evt] = memoryEventsFromToolCall({
      toolName: "memory_get",
      params: { path: "MEMORY.md", from: 1, lines: 20 },
      result: { content: [{ type: "text", text: "# Memory" }], details: { path: "MEMORY.md", text: "# Memory" } },
      agentId: "main",
    })
    expect(evt).toEqual({
      operation: "search_memory",
      storeId: "openclaw/main",
      recordId: "MEMORY.md",
      records: [{ id: "MEMORY.md", content: "# Memory" }],
    })
  })

  it("maps a blank write to delete_memory", () => {
    const [evt] = memoryEventsFromToolCall({
      toolName: "write",
      params: { path: "MEMORY.md", content: "  \n" },
      workspaceDir: "/ws",
    })
    expect(evt?.operation).toBe("delete_memory")
    expect(evt?.recordId).toBe("MEMORY.md")
  })

  it("flags an edit whose file cannot be read back", () => {
    const [evt] = memoryEventsFromToolCall(
      { toolName: "edit", params: { path: "USER.md", oldText: "a", newText: "b" }, workspaceDir: "/ws" },
      reader({}),
    )
    expect(evt).toEqual({
      operation: "upsert_memory",
      storeId: "openclaw/main",
      recordId: "USER.md",
      records: [],
      bodyUnavailable: true,
    })
  })

  it("ignores failed calls and unrelated tools", () => {
    expect(memoryEventsFromToolCall({ toolName: "memory_search", params: { query: "q" }, error: "boom" })).toEqual([])
    expect(memoryEventsFromToolCall({ toolName: "exec", params: { command: "ls" } })).toEqual([])
  })

  it("falls back to the result text when memory_search has no structured results", () => {
    const [evt] = memoryEventsFromToolCall({
      toolName: "memory_search",
      params: { query: "q" },
      result: { content: [{ type: "text", text: "No results" }] },
    })
    expect(evt?.records).toEqual([{ content: "No results" }])
  })

  it("turns a Codex apply_patch into one event per memory file it touched", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: /ws/USER.md",
      "@@",
      "+- Remember teal",
      "*** Add File: /ws/memory/2026-09-09.md",
      "+note",
      "*** Update File: /ws/src/app.ts",
      "+code",
      "*** Delete File: MEMORY.md",
      "*** End Patch",
    ].join("\n")
    const events = memoryEventsFromToolCall(
      { toolName: "apply_patch", params: { command: patch }, workspaceDir: "/ws", agentId: "main" },
      reader({ "/ws/USER.md": "# User\n- Remember teal", "/ws/memory/2026-09-09.md": "note" }),
    )
    expect(events).toEqual([
      {
        operation: "upsert_memory",
        storeId: "openclaw/main",
        recordId: "USER.md",
        records: [{ id: "USER.md", content: "# User\n- Remember teal" }],
      },
      {
        operation: "upsert_memory",
        storeId: "openclaw/main",
        recordId: "memory/2026-09-09.md",
        records: [{ id: "memory/2026-09-09.md", content: "note" }],
      },
      { operation: "delete_memory", storeId: "openclaw/main", recordId: "MEMORY.md", records: [] },
    ])
  })

  it("turns a Codex apply_patch into one event per memory file it touched", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: /ws/USER.md",
      "@@",
      "+- Remember teal",
      "*** Add File: /ws/memory/2026-09-09.md",
      "+note",
      "*** Update File: /ws/src/app.ts",
      "+code",
      "*** Delete File: MEMORY.md",
      "*** End Patch",
    ].join("\n")
    const events = memoryEventsFromToolCall(
      { toolName: "apply_patch", params: { command: patch }, workspaceDir: "/ws", agentId: "main" },
      reader({ "/ws/USER.md": "# User\n- Remember teal", "/ws/memory/2026-09-09.md": "note" }),
    )
    expect(events).toEqual([
      {
        operation: "upsert_memory",
        storeId: "openclaw/main",
        recordId: "USER.md",
        records: [{ id: "USER.md", content: "# User\n- Remember teal" }],
      },
      {
        operation: "upsert_memory",
        storeId: "openclaw/main",
        recordId: "memory/2026-09-09.md",
        records: [{ id: "memory/2026-09-09.md", content: "note" }],
      },
      { operation: "delete_memory", storeId: "openclaw/main", recordId: "MEMORY.md", records: [] },
    ])
  })
})

describe("memorySnapshot", () => {
  it("reads every non-empty built-in file once", () => {
    const evt = memorySnapshot(
      "/ws",
      "main",
      reader({ "/ws/MEMORY.md": "m", "/ws/USER.md": " ", "/ws/memory/2026-01-02.md": "d" }),
      new Date("2026-01-02T10:00:00Z"),
    )
    expect(evt?.records).toEqual([
      { id: "MEMORY.md", content: "m" },
      { id: "memory/2026-01-02.md", content: "d" },
    ])
  })

  it("returns undefined when no store file exists", () => {
    expect(memorySnapshot("/ws", "main", reader({}))).toBeUndefined()
    expect(memorySnapshot(undefined, "main", reader({ "/ws/MEMORY.md": "m" }))).toBeUndefined()
  })
})
