import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import type {
  AssistantCall,
  ContentBlock,
  SubagentFile,
  ToolCall,
  ToolResultBlock,
  ToolUseBlock,
  TranscriptRow,
  Turn,
  Usage,
} from "./types.ts"

interface ReadResult {
  rows: TranscriptRow[]
  newOffset: number
  newBuffer: string
}

export function readAllTurns(path: string, opts: { includeSidechain?: boolean } = {}): Turn[] {
  if (!existsSync(path)) return []
  const raw = readFileSync(path, "utf-8")
  const rows: TranscriptRow[] = []
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      rows.push(JSON.parse(trimmed) as TranscriptRow)
    } catch {
      // skip malformed line
    }
  }
  return buildTurns(rows, opts)
}

export function readIncremental(path: string, offset: number, buffer: string): ReadResult {
  if (!existsSync(path)) return { rows: [], newOffset: offset, newBuffer: buffer }

  const { size } = statSync(path)
  if (size < offset) {
    // file was truncated or rotated; restart from beginning
    offset = 0
    buffer = ""
  }
  if (size === offset) return { rows: [], newOffset: offset, newBuffer: buffer }

  const fd = openSync(path, "r")
  try {
    const length = size - offset
    const chunk = Buffer.alloc(length)
    readSync(fd, chunk, 0, length, offset)
    const text = buffer + chunk.toString("utf-8")
    const parts = text.split("\n")
    const tail = parts.pop() ?? ""
    const rows: TranscriptRow[] = []
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        rows.push(JSON.parse(trimmed) as TranscriptRow)
      } catch {
        // skip malformed line
      }
    }
    return { rows, newOffset: size, newBuffer: tail }
  } finally {
    closeSync(fd)
  }
}

interface ToolResultEntry {
  block: ToolResultBlock
  promptId?: string
  rowMs?: number
}

export function buildTurns(
  rows: TranscriptRow[],
  opts: {
    includeSidechain?: boolean
  } = {},
): Turn[] {
  const allowSidechain = opts.includeSidechain === true
  const turns: Turn[] = []
  let userRow: TranscriptRow | undefined
  let assistantRows: TranscriptRow[] = []
  let toolResults = new Map<string, ToolResultEntry>()

  const flush = () => {
    if (!userRow) return
    if (assistantRows.length === 0) return
    turns.push(buildTurn(userRow, assistantRows, toolResults))
  }

  for (const row of rows) {
    if (!allowSidechain && row.isSidechain) continue
    if (row.isMeta) continue
    if (row.type === "file-history-snapshot") continue
    if (row.type === "system") continue
    if (row.type === "summary") continue

    if (isToolResultRow(row)) {
      const rowMs = parseTs(row.timestamp)
      for (const block of iterToolResults(row)) {
        if (!block.tool_use_id) continue
        const entry: ToolResultEntry = { block }
        if (row.promptId) entry.promptId = row.promptId
        if (rowMs !== undefined) entry.rowMs = rowMs
        toolResults.set(block.tool_use_id, entry)
      }
      continue
    }

    const role = roleOf(row)
    if (role === "user") {
      flush()
      userRow = row
      assistantRows = []
      toolResults = new Map()
      continue
    }

    if (role === "assistant") {
      if (!userRow) continue
      // Claude Code writes each content block as its own JSONL row with the same message.id
      // representing a single LLM call. Multiple distinct message.ids under one user turn
      // indicate a tool loop — one LLM call per message.id.
      assistantRows.push(row)
    }
  }

  flush()
  return turns
}

function buildTurn(
  userRow: TranscriptRow,
  assistantRows: TranscriptRow[],
  toolResults: Map<string, ToolResultEntry>,
): Turn {
  const userText = extractText(contentOf(userRow))
  const startMs = parseTs(userRow.timestamp) ?? Date.now()

  const calls = buildAssistantCalls(assistantRows, toolResults, startMs)

  const lastCallEnd = calls.length > 0 ? (calls[calls.length - 1]?.endMs ?? startMs) : startMs
  const lastResultEnd = maxToolResultMs(toolResults)
  const endMs = Math.max(lastCallEnd, lastResultEnd ?? lastCallEnd)

  return { userText, calls, startMs, endMs }
}

function maxToolResultMs(toolResults: Map<string, ToolResultEntry>): number | undefined {
  let max: number | undefined
  for (const entry of toolResults.values()) {
    if (entry.rowMs === undefined) continue
    if (max === undefined || entry.rowMs > max) max = entry.rowMs
  }
  return max
}

function buildAssistantCalls(
  assistantRows: TranscriptRow[],
  toolResults: Map<string, ToolResultEntry>,
  turnStartMs: number,
): AssistantCall[] {
  // Group assistant rows by message.id preserving arrival order. Each group = one LLM call.
  const groupOrder: string[] = []
  const groups = new Map<string, TranscriptRow[]>()
  assistantRows.forEach((row, idx) => {
    const id = row.message?.id ?? `noid:${idx}`
    if (!groups.has(id)) {
      groups.set(id, [])
      groupOrder.push(id)
    }
    groups.get(id)?.push(row)
  })

  const calls: AssistantCall[] = []
  const seenToolIds = new Set<string>()
  let previousCallEnd = turnStartMs

  for (const id of groupOrder) {
    const groupRows = groups.get(id) ?? []
    const text = groupRows
      .map((r) => extractText(contentOf(r)))
      .filter((t) => t.length > 0)
      .join("\n\n")
    const modelRow = groupRows.find((r) => r.message?.model && r.message.model !== "<synthetic>")
    const model = modelRow?.message?.model ?? "claude"

    // Usage is updated cumulatively per row; last write wins within a call.
    let tokens: Usage = {}
    for (const r of groupRows) {
      if (r.message?.usage) tokens = r.message.usage
    }

    // Per-call start/end from row timestamps. Fall back to the prior boundary.
    const rowMs = groupRows.map((r) => parseTs(r.timestamp)).filter((ms): ms is number => ms !== undefined)
    const startMs = rowMs.length > 0 ? Math.min(...rowMs) : previousCallEnd
    const endMs = rowMs.length > 0 ? Math.max(...rowMs) : startMs

    const toolUses: ToolCall[] = []
    for (const row of groupRows) {
      for (const block of iterToolUses(row)) {
        if (seenToolIds.has(block.id)) continue
        seenToolIds.add(block.id)
        const entry = toolResults.get(block.id)
        const call: ToolCall = {
          id: block.id,
          name: block.name,
          input: block.input,
          output: entry?.block.content,
          isError: entry?.block.is_error === true,
          startMs: endMs,
          endMs: entry?.rowMs ?? endMs,
        }
        if (entry?.promptId) call.promptId = entry.promptId
        toolUses.push(call)
      }
    }

    calls.push({ messageId: id, model, text, toolUses, tokens, startMs, endMs })
    previousCallEnd = endMs
  }

  return calls
}

function isToolResultRow(row: TranscriptRow): boolean {
  if (roleOf(row) !== "user") return false
  const c = contentOf(row)
  if (!Array.isArray(c)) return false
  return c.some((b) => isBlock(b) && b.type === "tool_result")
}

function iterToolResults(row: TranscriptRow): ToolResultBlock[] {
  const c = contentOf(row)
  if (!Array.isArray(c)) return []
  return c.filter((b): b is ToolResultBlock => isBlock(b) && b.type === "tool_result")
}

function iterToolUses(row: TranscriptRow): ToolUseBlock[] {
  const c = contentOf(row)
  if (!Array.isArray(c)) return []
  return c.filter((b): b is ToolUseBlock => isBlock(b) && b.type === "tool_use")
}

function isBlock(b: unknown): b is ContentBlock {
  return typeof b === "object" && b !== null && "type" in b
}

function contentOf(row: TranscriptRow): string | ContentBlock[] | undefined {
  if (row.message && "content" in row.message) return row.message.content
  return row.content
}

function roleOf(row: TranscriptRow): "user" | "assistant" | undefined {
  if (row.type === "user" || row.type === "assistant") return row.type
  const r = row.message?.role
  if (r === "user" || r === "assistant") return r
  return undefined
}

function extractText(content: string | ContentBlock[] | undefined): string {
  if (content === undefined) return ""
  if (typeof content === "string") return content
  const parts: string[] = []
  for (const b of content) {
    if (!isBlock(b)) continue
    if (b.type === "text" && typeof (b as { text?: string }).text === "string") {
      parts.push((b as { text: string }).text)
    }
  }
  return parts.join("\n")
}

function parseTs(ts: string | undefined): number | undefined {
  if (!ts) return undefined
  const ms = Date.parse(ts)
  return Number.isFinite(ms) ? ms : undefined
}

function subagentDir(mainTranscriptPath: string): string {
  const dir = dirname(mainTranscriptPath)
  const sessionId = basename(mainTranscriptPath, extname(mainTranscriptPath))
  return join(dir, sessionId, "subagents")
}

export function discoverSubagentFiles(mainTranscriptPath: string): SubagentFile[] {
  const sub = subagentDir(mainTranscriptPath)
  if (!existsSync(sub)) return []
  const entries = readdirSync(sub)
  const files: SubagentFile[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue
    const agentId = entry.replace(/^agent-/, "").replace(/\.jsonl$/, "")
    if (!agentId) continue
    files.push({
      agentId,
      filePath: join(sub, entry),
      metaPath: join(sub, entry.replace(/\.jsonl$/, ".meta.json")),
    })
  }
  return files
}

interface SubagentMeta {
  agentType: string
  description: string
}

export function readSubagentMeta(metaPath: string): SubagentMeta | undefined {
  try {
    if (!existsSync(metaPath)) return undefined
    const raw = readFileSync(metaPath, "utf-8")
    const obj = JSON.parse(raw) as Partial<SubagentMeta>
    if (typeof obj.agentType !== "string") return undefined
    return {
      agentType: obj.agentType,
      description: typeof obj.description === "string" ? obj.description : "",
    }
  } catch {
    return undefined
  }
}

export function firstPromptIdOf(rows: TranscriptRow[]): string | undefined {
  for (const row of rows) {
    if (row.promptId && roleOf(row) === "user") return row.promptId
  }
  return undefined
}
