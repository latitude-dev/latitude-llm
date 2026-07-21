import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { classifyMemoryTool, memoryDirFromTranscript } from "./memory.ts"
import type { MemoryEmitOptions, ToolCall } from "./types.ts"

const DIR = "/home/u/.claude/projects/-home-u-repo/memory"

function tool(partial: Partial<ToolCall> & Pick<ToolCall, "name" | "input">): ToolCall {
  return { id: "t1", startMs: 1, endMs: 2, ...partial }
}

function opts(overrides: Partial<MemoryEmitOptions> = {}): MemoryEmitOptions {
  return { dir: DIR, captureContent: false, ...overrides }
}

describe("memoryDirFromTranscript", () => {
  it("resolves the sibling memory dir of the transcript", () => {
    expect(memoryDirFromTranscript("/home/u/.claude/projects/-home-u-repo/sess.jsonl")).toBe(DIR)
  })
})

describe("classifyMemoryTool", () => {
  it("returns null for a non-file tool", () => {
    expect(classifyMemoryTool(tool({ name: "Bash", input: { command: "ls" } }), opts())).toBeNull()
  })

  it("returns null for a file outside the memory dir", () => {
    expect(classifyMemoryTool(tool({ name: "Edit", input: { file_path: "/home/u/repo/src/a.ts" } }), opts())).toBeNull()
  })

  it("maps Write to upsert_memory with the store slug and record path", () => {
    const op = classifyMemoryTool(
      tool({ name: "Write", input: { file_path: `${DIR}/MEMORY.md`, content: "hi" } }),
      opts(),
    )
    expect(op).toMatchObject({ operation: "upsert_memory", storeId: "-home-u-repo", recordId: "MEMORY.md", count: 1 })
    expect(op?.body).toBeUndefined()
  })

  it("maps Edit/MultiEdit to update_memory and preserves nested record ids", () => {
    const edit = classifyMemoryTool(tool({ name: "Edit", input: { file_path: `${DIR}/a/b.md` } }), opts())
    expect(edit).toMatchObject({ operation: "update_memory", recordId: "a/b.md" })
    const multi = classifyMemoryTool(tool({ name: "MultiEdit", input: { file_path: `${DIR}/a/b.md` } }), opts())
    expect(multi?.operation).toBe("update_memory")
  })

  it("maps Read to search_memory", () => {
    const op = classifyMemoryTool(tool({ name: "Read", input: { file_path: `${DIR}/MEMORY.md` } }), opts())
    expect(op?.operation).toBe("search_memory")
  })

  it("captures the Write body from input.content", () => {
    const op = classifyMemoryTool(
      tool({ name: "Write", input: { file_path: `${DIR}/x.md`, content: "hello" } }),
      opts({ captureContent: true }),
    )
    expect(op?.body).toBe("hello")
  })

  it("captures the Edit body via the injected readFile", () => {
    const op = classifyMemoryTool(
      tool({ name: "Edit", input: { file_path: `${DIR}/x.md`, old_string: "a", new_string: "b" } }),
      opts({ captureContent: true, readFile: () => "full body" }),
    )
    expect(op?.body).toBe("full body")
  })

  it("falls back to count-only when the Edit readFile fails", () => {
    const op = classifyMemoryTool(
      tool({ name: "Edit", input: { file_path: `${DIR}/x.md` } }),
      opts({ captureContent: true, readFile: () => undefined }),
    )
    expect(op?.operation).toBe("update_memory")
    expect(op?.body).toBeUndefined()
  })

  it("captures the Read body from output, stripping line-number prefixes", () => {
    const op = classifyMemoryTool(
      tool({ name: "Read", input: { file_path: `${DIR}/x.md` }, output: "     1\t# Title\n     2\tbody line" }),
      opts({ captureContent: true }),
    )
    expect(op?.body).toBe("# Title\nbody line")
  })

  it("reads the Read body from text content blocks", () => {
    const op = classifyMemoryTool(
      tool({ name: "Read", input: { file_path: `${DIR}/x.md` }, output: [{ type: "text", text: "1\thi" }] }),
      opts({ captureContent: true }),
    )
    expect(op?.body).toBe("hi")
  })
})

describe("classifyMemoryTool default disk read", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-memory-"))
  const memDir = join(root, "proj", "memory")
  mkdirSync(memDir, { recursive: true })
  writeFileSync(join(memDir, "topic.md"), "real disk content")
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it("reads the edited file from disk when no readFile is injected", () => {
    const op = classifyMemoryTool(
      tool({ name: "Edit", input: { file_path: join(memDir, "topic.md"), old_string: "a", new_string: "b" } }),
      { dir: memDir, captureContent: true },
    )
    expect(op).toMatchObject({ operation: "update_memory", storeId: "proj", recordId: "topic.md" })
    expect(op?.body).toBe("real disk content")
  })
})
