import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import type {
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
  let toolResults = new Map<string, ToolResultBlock>()
  let toolPromptIds = new Map<string, string>()

  const flush = () => {
    if (!userRow) return
    if (assistantRows.length === 0) return
    turns.push(buildTurn(userRow, assistantRows, toolResults, toolPromptIds))
  }

  for (const row of rows) {
    if (!allowSidechain && row.isSidechain) continue
    if (row.isMeta) continue
    if (row.type === "file-history-snapshot") continue
    if (row.type === "system") continue
    if (row.type === "summary") continue

    if (isToolResultRow(row)) {
      for (const block of iterToolResults(row)) {
        if (!block.tool_use_id) continue
        toolResults.set(block.tool_use_id, block)
        if (row.promptId) toolPromptIds.set(block.tool_use_id, row.promptId)
      }
      continue
    }

    const role = roleOf(row)
    if (role === "user") {
      flush()
      userRow = row
      assistantRows = []
      toolResults = new Map()
      toolPromptIds = new Map()
      continue
    }

    if (role === "assistant") {
      if (!userRow) continue
      // Claude Code writes each content block as its own JSONL row with the same message.id.
      // We keep every row and aggregate text/tool_uses across them; usage is deduped per
      // message.id (latest wins) in aggregateUsage.
      assistantRows.push(row)
    }
  }

  flush()
  return turns
}

function buildTurn(
  userRow: TranscriptRow,
  assistantRows: TranscriptRow[],
  toolResults: Map<string, ToolResultBlock>,
  toolPromptIds: Map<string, string>,
): Turn {
  const userText = extractText(contentOf(userRow))
  const assistantText = assistantRows
    .map((r) => extractText(contentOf(r)))
    .filter((t) => t.length > 0)
    .join("\n\n")
  const modelRow = assistantRows.find((r) => r.message?.model && r.message.model !== "<synthetic>")
  const model = modelRow?.message?.model ?? "claude"
  const lastAssistant = assistantRows[assistantRows.length - 1]

  const tokens = aggregateUsage(assistantRows)
  const toolCalls = collectToolCalls(assistantRows, toolResults, toolPromptIds)

  const startMs = parseTs(userRow.timestamp) ?? Date.now()
  const endMs = parseTs(lastAssistant?.timestamp) ?? startMs

  return { userText, assistantText, model, tokens, toolCalls, startMs, endMs }
}

function aggregateUsage(rows: TranscriptRow[]): Usage {
  // Each assistant content block is its own row but shares message.id with its siblings,
  // and usage is updated on each row (later rows supersede earlier ones for the same id).
  // We keep only the last usage per message.id, then sum across distinct messages.
  const perMessage = new Map<string, Usage>()
  rows.forEach((r, idx) => {
    const u = r.message?.usage
    if (!u) return
    const id = r.message?.id ?? `noid:${idx}`
    perMessage.set(id, u)
  })
  const out: Usage = {}
  for (const u of perMessage.values()) {
    if (u.input_tokens !== undefined) out.input_tokens = (out.input_tokens ?? 0) + u.input_tokens
    if (u.output_tokens !== undefined) out.output_tokens = (out.output_tokens ?? 0) + u.output_tokens
    if (u.cache_read_input_tokens !== undefined)
      out.cache_read_input_tokens = (out.cache_read_input_tokens ?? 0) + u.cache_read_input_tokens
    if (u.cache_creation_input_tokens !== undefined)
      out.cache_creation_input_tokens = (out.cache_creation_input_tokens ?? 0) + u.cache_creation_input_tokens
  }
  return out
}

function collectToolCalls(
  assistantRows: TranscriptRow[],
  toolResults: Map<string, ToolResultBlock>,
  toolPromptIds: Map<string, string>,
): ToolCall[] {
  const seen = new Set<string>()
  const calls: ToolCall[] = []
  for (const row of assistantRows) {
    for (const block of iterToolUses(row)) {
      if (seen.has(block.id)) continue
      seen.add(block.id)
      const result = toolResults.get(block.id)
      const promptId = toolPromptIds.get(block.id)
      const call: ToolCall = {
        id: block.id,
        name: block.name,
        input: block.input,
        output: result?.content,
        isError: result?.is_error === true,
      }
      if (promptId) call.promptId = promptId
      calls.push(call)
    }
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
