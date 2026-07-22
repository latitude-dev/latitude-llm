import { readFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { MemoryEmitOptions, MemoryOp, ToolCall } from "./types.ts"

// Auto memory rides ordinary file tools, so operations are keyed by tool name, not a memory tool.
const MEMORY_TOOL_OPERATIONS: Record<string, MemoryOp["operation"]> = {
  Write: "upsert_memory",
  Edit: "update_memory",
  MultiEdit: "update_memory",
  Read: "search_memory",
}

// The transcript lives at ~/.claude/projects/<project>/<session>.jsonl; the auto-memory
// directory is its sibling.
export function memoryDirFromTranscript(transcriptPath: string): string {
  return join(dirname(transcriptPath), "memory")
}

export function classifyMemoryTool(tool: ToolCall, opts: MemoryEmitOptions): MemoryOp | null {
  const operation = MEMORY_TOOL_OPERATIONS[tool.name]
  if (!operation) return null

  const input = tool.input as Record<string, unknown> | undefined
  const filePath = typeof input?.file_path === "string" ? input.file_path : undefined
  if (!filePath) return null

  const resolved = resolve(filePath)
  const rel = relative(opts.dir, resolved)
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null

  const op: MemoryOp = {
    operation,
    storeId: basename(dirname(opts.dir)),
    recordId: rel.split(sep).join("/"),
    count: 1,
  }

  if (opts.captureContent) {
    const body = extractBody(tool, operation, resolved, opts.readFile ?? defaultReadFile)
    if (body !== undefined) op.body = body
  }

  return op
}

function extractBody(
  tool: ToolCall,
  operation: MemoryOp["operation"],
  resolvedPath: string,
  readFile: (path: string) => string | undefined,
): string | undefined {
  if (operation === "upsert_memory") {
    const content = (tool.input as Record<string, unknown> | undefined)?.content
    return typeof content === "string" ? content : undefined
  }
  if (operation === "update_memory") {
    return readFile(resolvedPath)
  }
  const text = outputToText(tool.output)
  return text !== undefined ? stripLineNumbers(text) : undefined
}

function defaultReadFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function outputToText(output: unknown): string | undefined {
  if (typeof output === "string") return output
  if (Array.isArray(output)) {
    const parts = output
      .filter((b): b is { type: string; text?: unknown } => !!b && typeof b === "object" && "type" in b)
      .filter((b) => b.type === "text")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
    if (parts.length > 0) return parts.join("")
  }
  return undefined
}

// The Read tool returns file content with a `<line>\t` prefix per line; strip it so the
// recorded body matches the file on disk (token counts and diffs read the real content).
function stripLineNumbers(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\t/, ""))
    .join("\n")
}
