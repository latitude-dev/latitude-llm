/**
 * Normalizes provider-specific message shapes into the parts-based GenAI
 * format Latitude's parser expects:
 *
 *   { role: "system" | "user" | "assistant" | "tool", parts: MessagePart[] }
 *
 * Dialects handled, dispatched per item on the item's own shape:
 *
 *   - OpenClaw / pi-ai transcript: `{role:"user", content: string | (text|image)[]}`,
 *     `{role:"assistant", content: (text|thinking|toolCall)[]}`,
 *     `{role:"toolResult", toolCallId, toolName, content, isError}`,
 *     `{role:"custom", ...}` runtime notes.
 *   - Anthropic: `{role, content: string | ContentBlock[]}` with `text`,
 *     `tool_use`, `tool_result`, `image`, `thinking` blocks.
 *   - OpenAI Chat Completions: `{role, content: string, tool_calls?}` and
 *     `{role:"tool", tool_call_id, content}`.
 *   - Already-normalized parts-shape messages, passed through unchanged.
 *
 * Anything unrecognized becomes a JSON-stringified text part so nothing is
 * silently dropped.
 */

export interface MessagePart {
  type: string
  content?: string
  id?: string | undefined
  name?: string | undefined
  arguments?: unknown
  response?: unknown
  modality?: string
  uri?: string
  [key: string]: unknown
}

export type MessageRole = "system" | "user" | "assistant" | "tool"

export interface Message {
  role: MessageRole
  parts: MessagePart[]
}

const ALLOWED_ROLES: ReadonlySet<MessageRole> = new Set(["system", "user", "assistant", "tool"])

export function normalizeMessage(raw: unknown): Message | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  if (Array.isArray(obj.parts)) {
    const parts: MessagePart[] = []
    for (const p of obj.parts) {
      if (p && typeof p === "object") parts.push(p as MessagePart)
    }
    return { role: coerceRole(obj.role), parts: parts.length > 0 ? parts : [{ type: "text", content: safeJson(raw) }] }
  }

  if (obj.role === "toolResult") return normalizeToolResult(obj)
  if (obj.role === "custom") return normalizeCustom(obj)

  const content = obj.content ?? obj.text ?? obj.message
  const role = isRuntimeContext(obj, content) ? "system" : coerceRole(obj.role)

  if (role === "tool" && obj.tool_call_id !== undefined) {
    return {
      role,
      parts: [
        {
          type: "tool_call_response",
          id: typeof obj.tool_call_id === "string" ? obj.tool_call_id : "",
          response: content ?? safeJson(obj),
        },
      ],
    }
  }

  if (typeof content === "string") {
    const parts: MessagePart[] = []
    if (content.length > 0) parts.push({ type: "text", content })
    appendToolCalls(parts, obj.tool_calls)
    if (parts.length === 0) parts.push({ type: "text", content: "" })
    return { role, parts }
  }

  if (Array.isArray(content)) {
    const parts: MessagePart[] = []
    for (const block of content) {
      const part = normalizeBlock(block)
      if (part) parts.push(part)
    }
    appendToolCalls(parts, obj.tool_calls)
    if (parts.length === 0) parts.push({ type: "text", content: safeJson(content) })
    return { role, parts }
  }

  return { role, parts: [{ type: "text", content: safeJson(raw) }] }
}

export function normalizeMessages(raw: readonly unknown[]): Message[] {
  const out: Message[] = []
  for (const m of raw) {
    const norm = normalizeMessage(m)
    if (norm) out.push(norm)
  }
  return out
}

export function userMessageFromPrompt(prompt: string): Message {
  return { role: "user", parts: [{ type: "text", content: prompt }] }
}

export function assistantMessageFromOutput(assistantTexts: readonly string[], lastAssistant: unknown): Message {
  if (lastAssistant !== undefined) {
    const norm = normalizeMessage(lastAssistant)
    if (norm) return { ...norm, role: "assistant" }
  }
  const parts: MessagePart[] = []
  for (const text of assistantTexts) {
    if (text.length > 0) parts.push({ type: "text", content: text })
  }
  if (parts.length === 0) parts.push({ type: "text", content: "" })
  return { role: "assistant", parts }
}

export function systemInstructionsParts(prompt: string): MessagePart[] {
  return [{ type: "text", content: prompt }]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RUNTIME_CONTEXT_PREFIX = "[openclaw.runtime-context]"

/**
 * OpenClaw injects its per-turn context as an extra user message right before
 * the prompt. It is instructions rather than the user's words, so it renders
 * as a system message instead of a second user bubble.
 */
function isRuntimeContext(obj: Record<string, unknown>, content: unknown): boolean {
  if (obj.role !== "user") return false
  if (obj.runtimeContext) return true
  const text = typeof content === "string" ? content : Array.isArray(content) ? blockText(content[0]) : undefined
  return typeof text === "string" && text.trimStart().startsWith(RUNTIME_CONTEXT_PREFIX)
}

function coerceRole(raw: unknown): MessageRole {
  if (typeof raw !== "string") return "user"
  return ALLOWED_ROLES.has(raw as MessageRole) ? (raw as MessageRole) : "user"
}

function normalizeToolResult(obj: Record<string, unknown>): Message {
  const content = obj.content
  let response: unknown
  if (typeof content === "string") response = content
  else if (Array.isArray(content)) {
    const texts: string[] = []
    let hasNonText = false
    for (const block of content) {
      const text = blockText(block)
      if (text !== undefined) texts.push(text)
      else hasNonText = true
    }
    response = hasNonText ? content.map(normalizeBlock).filter(Boolean) : texts.join("\n")
  } else response = content ?? ""
  return {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: typeof obj.toolCallId === "string" ? obj.toolCallId : "",
        name: typeof obj.toolName === "string" ? obj.toolName : undefined,
        response,
        ...(obj.isError === true ? { is_error: true } : {}),
      },
    ],
  }
}

/** Text of a plain text block, or of the `toolResult` block the Codex harness wraps tool output in. */
function blockText(block: unknown): string | undefined {
  if (!block || typeof block !== "object") return undefined
  const b = block as Record<string, unknown>
  if (b.type === "text" && typeof b.text === "string") return b.text
  if (b.type === "toolResult") {
    if (typeof b.text === "string") return b.text
    if (typeof b.content === "string") return b.content
  }
  return undefined
}

function normalizeCustom(obj: Record<string, unknown>): Message {
  const text = typeof obj.content === "string" ? obj.content : safeJson(obj)
  const customType = typeof obj.customType === "string" ? obj.customType : "custom"
  return { role: "user", parts: [{ type: "text", content: `[${customType}] ${text}` }] }
}

function normalizeBlock(raw: unknown): MessagePart | undefined {
  if (typeof raw === "string") return { type: "text", content: raw }
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const type = typeof obj.type === "string" ? obj.type : "text"

  if (type === "text") {
    if (typeof obj.content === "string") return { type: "text", content: obj.content }
    if (typeof obj.text === "string") return { type: "text", content: obj.text }
  }
  if (type === "toolResult") {
    const text = blockText(obj)
    return { type: "text", content: text ?? safeJson(raw) }
  }
  if (type === "toolCall" || type === "tool_use" || type === "tool_call") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.arguments ?? obj.input ?? {},
    }
  }
  if (type === "tool_result") {
    return {
      type: "tool_call_response",
      id: typeof obj.tool_use_id === "string" ? obj.tool_use_id : "",
      response: obj.content ?? "",
    }
  }
  if (type === "tool_call_response") {
    return {
      type: "tool_call_response",
      id: typeof obj.id === "string" ? obj.id : "",
      response: obj.response ?? "",
    }
  }
  if (type === "thinking") {
    if (typeof obj.thinking === "string" && obj.thinking.length > 0) return { type: "reasoning", content: obj.thinking }
    if (obj.redacted === true) return { type: "reasoning", content: "[redacted]" }
    return undefined
  }
  if (type === "reasoning" && typeof obj.content === "string") {
    return { type: "reasoning", content: obj.content }
  }
  if (type === "image") {
    const uri = imageUri(obj)
    if (uri) return { type: "uri", modality: "image", uri }
    return { type: "text", content: "[image]" }
  }

  return { type, content: safeJson(raw) }
}

function imageUri(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.data === "string" && obj.data.length > 0) {
    const mime = typeof obj.mimeType === "string" ? obj.mimeType : "image/unknown"
    return `data:${mime};base64,${obj.data}`
  }
  if (obj.source && typeof obj.source === "object") {
    const src = obj.source as { media_type?: string; data?: string; url?: string }
    if (src.url) return src.url
    if (src.data) return `data:${src.media_type ?? "image/unknown"};base64,${src.data}`
  }
  return undefined
}

function appendToolCalls(parts: MessagePart[], raw: unknown): void {
  if (!Array.isArray(raw)) return
  for (const tc of raw) {
    if (!tc || typeof tc !== "object") continue
    const t = tc as Record<string, unknown>
    const fn = t.function as { name?: string; arguments?: string | Record<string, unknown> } | undefined
    let parsedArgs: unknown = fn?.arguments
    if (typeof parsedArgs === "string") {
      try {
        parsedArgs = JSON.parse(parsedArgs)
      } catch {
        // leave as string
      }
    }
    parts.push({
      type: "tool_call",
      id: typeof t.id === "string" ? t.id : "",
      name: fn?.name ?? "",
      arguments: parsedArgs ?? {},
    })
  }
}

function safeJson(value: unknown): string {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
