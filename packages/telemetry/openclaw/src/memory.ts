import { readFileSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

/**
 * OpenClaw's built-in memory is the agent workspace's `MEMORY.md`, `USER.md`
 * and the Markdown files under `memory/` (daily notes), read through the
 * bundled memory-core tools and written with the generic file tools. Reads and
 * writes surface as OTEL GenAI memory operations, one store per agent
 * (`openclaw/<agentId>`) and one record per file, whose body is the whole
 * file so Latitude's ledger can diff and blame per line.
 */

export type MemoryOperation = "search_memory" | "upsert_memory" | "delete_memory"

export interface MemoryRecord {
  id?: string | undefined
  content: unknown
  score?: number
  metadata?: Record<string, unknown>
}

export interface MemoryEvent {
  operation: MemoryOperation
  storeId: string
  recordId?: string | undefined
  queryText?: string | undefined
  records: MemoryRecord[]
  /** Set when the body had to come from disk and the read failed. */
  bodyUnavailable?: boolean
}

export type FileReader = (path: string) => string | undefined

const MAX_FILE_BYTES = 1024 * 1024
const MEMORY_ROOT_FILES = new Set(["MEMORY.md", "memory.md", "USER.md", "user.md"])
const MEMORY_DIR = "memory"

function memoryStoreId(agentId: string | undefined): string {
  return `openclaw/${agentId ?? "main"}`
}

const defaultFileReader: FileReader = (path) => {
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return undefined
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

/** Workspace-relative record id for a path inside the memory scope, else undefined. */
export function memoryRecordId(path: string | undefined, workspaceDir: string | undefined): string | undefined {
  if (!path) return undefined
  const abs = workspaceDir ? resolve(workspaceDir, path) : isAbsolute(path) ? path : undefined
  if (!abs) return undefined
  const rel = workspaceDir ? relative(workspaceDir, abs) : abs
  if (rel.startsWith("..")) return undefined
  const normalized = rel.split(sep).join("/")
  if (MEMORY_ROOT_FILES.has(normalized)) return normalized
  if (normalized.startsWith(`${MEMORY_DIR}/`) && normalized.endsWith(".md")) return normalized
  return undefined
}

interface ToolCallShape {
  toolName: string
  params: Record<string, unknown>
  result?: unknown
  error?: string | undefined
  workspaceDir?: string | undefined
  agentId?: string | undefined
}

/** Classify a finished tool call as memory operations; empty when it touched none. */
export function memoryEventsFromToolCall(call: ToolCallShape, readFile: FileReader = defaultFileReader): MemoryEvent[] {
  if (call.error) return []
  if (call.toolName === "apply_patch") return patchEvents(call, memoryStoreId(call.agentId), readFile)
  const single = singleMemoryEvent(call, readFile)
  return single ? [single] : []
}

function singleMemoryEvent(call: ToolCallShape, readFile: FileReader): MemoryEvent | undefined {
  const storeId = memoryStoreId(call.agentId)
  switch (call.toolName) {
    case "memory_search":
      return {
        operation: "search_memory",
        storeId,
        queryText: str(call.params.query),
        records: searchRecords(call.result),
      }
    case "memory_get": {
      const path = str(call.params.path)
      const text = resultText(call.result)
      return {
        operation: "search_memory",
        storeId,
        recordId: path,
        records: text !== undefined ? [{ id: path, content: text }] : [],
      }
    }
    case "memory_recall":
      return {
        operation: "search_memory",
        storeId,
        queryText: str(call.params.query),
        records: searchRecords(call.result),
      }
    case "memory_store": {
      const text = str(call.params.text) ?? str(call.params.content)
      return { operation: "upsert_memory", storeId, records: text !== undefined ? [{ content: text }] : [] }
    }
    case "memory_forget":
      return {
        operation: "delete_memory",
        storeId,
        recordId: str(call.params.id) ?? str(call.params.query),
        records: [],
      }
    case "write":
    case "edit":
      return fileWriteEvent(call, storeId, readFile)
    default:
      return undefined
  }
}

function fileWriteEvent(call: ToolCallShape, storeId: string, readFile: FileReader): MemoryEvent | undefined {
  const path = str(call.params.path)
  const recordId = memoryRecordId(path, call.workspaceDir)
  if (!recordId || !path) return undefined
  const abs = call.workspaceDir ? resolve(call.workspaceDir, path) : path
  const body = call.toolName === "write" ? str(call.params.content) : readFile(abs)
  return writeEvent(storeId, recordId, body)
}

function writeEvent(storeId: string, recordId: string, body: string | undefined): MemoryEvent {
  if (body === undefined) return { operation: "upsert_memory", storeId, recordId, records: [], bodyUnavailable: true }
  if (body.trim().length === 0) return { operation: "delete_memory", storeId, recordId, records: [] }
  return { operation: "upsert_memory", storeId, recordId, records: [{ id: recordId, content: body }] }
}

const PATCH_FILE_LINE = /^\*\*\* (Update|Add|Delete) File: (.+)$/gm

/**
 * Codex's `apply_patch` takes one patch text touching any number of files
 * (`*** Update File: <path>`). Each memory-scoped file becomes its own event,
 * with the body read back from disk after the patch landed.
 */
function patchEvents(call: ToolCallShape, storeId: string, readFile: FileReader): MemoryEvent[] {
  const patch = str(call.params.command) ?? str(call.params.input) ?? str(call.params.patch)
  if (!patch) return []
  const events: MemoryEvent[] = []
  for (const match of patch.matchAll(PATCH_FILE_LINE)) {
    const action = match[1]
    const path = match[2]?.trim()
    const recordId = memoryRecordId(path, call.workspaceDir)
    if (!recordId || !path) continue
    if (action === "Delete") {
      events.push({ operation: "delete_memory", storeId, recordId, records: [] })
      continue
    }
    const abs = call.workspaceDir ? resolve(call.workspaceDir, path) : path
    events.push(writeEvent(storeId, recordId, readFile(abs)))
  }
  return events
}

/**
 * The frozen snapshot injected at session start: every non-empty built-in
 * store file, read once per session. Returns undefined when nothing exists.
 */
export function memorySnapshot(
  workspaceDir: string | undefined,
  agentId: string | undefined,
  readFile: FileReader = defaultFileReader,
  today: Date = new Date(),
): MemoryEvent | undefined {
  if (!workspaceDir) return undefined
  const day = today.toISOString().slice(0, 10)
  const candidates = ["MEMORY.md", "USER.md", `${MEMORY_DIR}/${day}.md`]
  const records: MemoryRecord[] = []
  for (const rel of candidates) {
    const body = readFile(resolve(workspaceDir, rel))
    if (body !== undefined && body.trim().length > 0) records.push({ id: rel, content: body })
  }
  if (records.length === 0) return undefined
  return { operation: "search_memory", storeId: memoryStoreId(agentId), records }
}

// ─── Tool result parsing ────────────────────────────────────────────────────

function searchRecords(result: unknown): MemoryRecord[] {
  const details = detailsOf(result)
  const list = Array.isArray(details?.results) ? details.results : undefined
  if (list) {
    const out: MemoryRecord[] = []
    for (const item of list) {
      if (!item || typeof item !== "object") continue
      const r = item as Record<string, unknown>
      const path = str(r.path)
      const line = typeof r.startLine === "number" ? `#${r.startLine}` : ""
      out.push({
        ...(path ? { id: `${path}${line}` } : {}),
        content: str(r.snippet) ?? str(r.text) ?? str(r.content) ?? "",
        ...(typeof r.score === "number" ? { score: r.score } : {}),
      })
    }
    return out
  }
  const text = resultText(result)
  return text !== undefined && text.length > 0 ? [{ content: text }] : []
}

function detailsOf(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") return undefined
  const details = (result as { details?: unknown }).details
  return details && typeof details === "object" ? (details as Record<string, unknown>) : undefined
}

function resultText(result: unknown): string | undefined {
  if (typeof result === "string") return result
  if (!result || typeof result !== "object") return undefined
  const details = detailsOf(result)
  if (details && typeof details.text === "string") return details.text
  const content = (result as { content?: unknown }).content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const texts = content
      .map((b) =>
        b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string"
          ? (b as { text: string }).text
          : "",
      )
      .filter((t) => t.length > 0)
    if (texts.length > 0) return texts.join("\n")
  }
  return undefined
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
