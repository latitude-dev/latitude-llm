import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const REQUESTS_DIR = join(homedir(), ".claude", "state", "latitude", "requests")
const STALE_MS = 24 * 60 * 60 * 1000 // 24h

export interface AnthropicSystemBlock {
  type: string
  text?: string
  content?: string
}

export type AnthropicSystem = string | AnthropicSystemBlock[] | undefined

export interface AnthropicToolDefinition {
  name: string
  description?: string
  input_schema?: unknown
  [key: string]: unknown
}

export interface AnthropicMessageBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  source?: { media_type?: string; data?: string; url?: string; type?: string }
}

export interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | AnthropicMessageBlock[]
}

export interface AnthropicRequest {
  model?: string
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  system?: AnthropicSystem
  tools?: AnthropicToolDefinition[]
  tool_choice?: unknown
  messages?: AnthropicMessage[]
  thinking?: { type?: string; budget_tokens?: number }
  [key: string]: unknown
}

export interface StoredRequest {
  messageId: string
  capturedAt: string
  url: string
  request: AnthropicRequest
}

function loadRequest(messageId: string): StoredRequest | undefined {
  if (!messageId) return undefined
  const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_")
  const file = join(REQUESTS_DIR, `${safeId}.json`)
  try {
    if (!existsSync(file)) return undefined
    const raw = readFileSync(file, "utf-8")
    const parsed = JSON.parse(raw) as StoredRequest
    if (!parsed || typeof parsed !== "object" || !parsed.request) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function loadRequestsByMessageId(messageIds: Iterable<string>): Map<string, StoredRequest> {
  const map = new Map<string, StoredRequest>()
  for (const id of messageIds) {
    const entry = loadRequest(id)
    if (entry) map.set(id, entry)
  }
  return map
}

export function deleteRequest(messageId: string): void {
  if (!messageId) return
  const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, "_")
  const file = join(REQUESTS_DIR, `${safeId}.json`)
  try {
    unlinkSync(file)
  } catch {
    // already gone
  }
}

export function pruneStaleRequests(now: number = Date.now()): number {
  let pruned = 0
  try {
    if (!existsSync(REQUESTS_DIR)) return 0
    const entries = readdirSync(REQUESTS_DIR)
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const file = join(REQUESTS_DIR, entry)
      try {
        const st = statSync(file)
        if (now - st.mtimeMs > STALE_MS) {
          unlinkSync(file)
          pruned++
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return pruned
}
