/**
 * Normalizes provider-specific message shapes (Anthropic, OpenAI, pi-ai) into
 * the parts-based GenAI format Latitude's parser expects:
 *
 *   { role: "system" | "user" | "assistant" | "tool", parts: MessagePart[] }
 *
 * Downstream consumers cast `gen_ai.input.messages` and `gen_ai.output.messages`
 * to `GenAIMessage[]` and read `message.parts` directly (e.g. for search
 * indexing). Without normalisation those casts produce objects without
 * `parts`, breaking rendering.
 *
 * The shapes we need to handle:
 *
 *   - Anthropic: `{role, content: string}` or `{role, content: ContentBlock[]}`
 *     with blocks `{type: "text", text}`, `{type: "tool_use", id, name, input}`,
 *     `{type: "tool_result", tool_use_id, content}`, `{type: "image", source}`,
 *     `{type: "thinking", thinking}`.
 *   - OpenAI: `{role, content: string}` or with `tool_calls` field.
 *   - pi-ai (OpenClaw's wrapper) — superset of the above.
 *   - Already-normalized parts-shape messages — passed through unchanged.
 *
 * Anything we don't recognize falls through to a JSON-stringified text part
 * so nothing is silently dropped.
 */

export interface MessagePart {
  type: string
  content?: string
  // Tool call (assistant invokes a tool)
  id?: string
  name?: string
  arguments?: unknown
  // Tool response (tool replies)
  response?: unknown
  // Image / multimodal
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

/**
 * Normalize a single message of any of the provider shapes we know about.
 * Returns `undefined` for non-objects so the caller can skip them.
 */
export function normalizeMessage(raw: unknown): Message | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const role = coerceRole(obj.role)

  // Pre-normalized: already has a parts array.
  if (Array.isArray(obj.parts)) {
    const parts: MessagePart[] = []
    for (const p of obj.parts) {
      if (p && typeof p === "object") parts.push(p as MessagePart)
    }
    return { role, parts: parts.length > 0 ? parts : [{ type: "text", content: safeJson(raw) }] }
  }

  const content = obj.content ?? obj.text ?? obj.message

  // OpenAI tool message: `{role: "tool", tool_call_id, content}` — handle
  // before the generic string-content branch so we emit a tool_call_response
  // part rather than a plain text part.
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
    const parts: MessagePart[] = [{ type: "text", content }]
    // OpenAI assistant messages may have tool_calls alongside string content.
    appendToolCalls(parts, obj.tool_calls)
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

  // Unknown shape — dump as JSON so nothing is silently dropped.
  return { role, parts: [{ type: "text", content: safeJson(raw) }] }
}

/** Normalize an array of provider messages. */
export function normalizeMessages(raw: unknown[]): Message[] {
  const out: Message[] = []
  for (const m of raw) {
    const norm = normalizeMessage(m)
    if (norm) out.push(norm)
  }
  return out
}

/** Build a single user message from a string prompt. */
export function userMessageFromPrompt(prompt: string): Message {
  return { role: "user", parts: [{ type: "text", content: prompt }] }
}

/** Build a single assistant message from `assistantTexts` + `lastAssistant` fallback. */
export function assistantMessageFromOutput(assistantTexts: string[], lastAssistant: unknown): Message {
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

/**
 * Wrap a system prompt string into the parts-array shape expected for
 * `gen_ai.system_instructions`. Empty string in → single empty text part out
 * (still a valid array, never `undefined`).
 */
export function systemInstructionsParts(prompt: string): MessagePart[] {
  return [{ type: "text", content: prompt }]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function coerceRole(raw: unknown): MessageRole {
  if (typeof raw !== "string") return "user"
  return ALLOWED_ROLES.has(raw as MessageRole) ? (raw as MessageRole) : "user"
}

function normalizeBlock(raw: unknown): MessagePart | undefined {
  if (typeof raw === "string") return { type: "text", content: raw }
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  // Already a part.
  if (typeof obj.type === "string" && (typeof obj.content === "string" || obj.content === undefined)) {
    // If it carries our recognized shape (text / tool_call / tool_call_response /
    // uri), pass through. Otherwise fall through to type-specific normalization.
    if (obj.type === "text" && typeof obj.content === "string") {
      return { type: "text", content: obj.content }
    }
  }

  const type = typeof obj.type === "string" ? obj.type : "text"

  if (type === "text" && typeof obj.text === "string") {
    return { type: "text", content: obj.text }
  }
  if (type === "tool_use") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.input ?? {},
    }
  }
  if (type === "tool_call") {
    // Already-normalized tool_call part — pass through.
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
  if (type === "thinking" && typeof obj.thinking === "string") {
    return { type: "reasoning", content: obj.thinking }
  }
  if (type === "reasoning" && typeof obj.content === "string") {
    return { type: "reasoning", content: obj.content }
  }
  if (type === "image" && obj.source && typeof obj.source === "object") {
    const src = obj.source as { media_type?: string; data?: string; url?: string }
    const uri = src.url ?? (src.data ? `data:${src.media_type ?? "image/unknown"};base64,${src.data}` : "")
    if (uri) return { type: "uri", modality: "image", uri }
  }

  // Unknown block type — stringify so nothing is silently dropped.
  return { type, content: safeJson(raw) }
}

/**
 * OpenAI assistant messages put tool calls in a separate `tool_calls` array
 * alongside string content. Append them as parts so the trace shows what the
 * model emitted in that turn.
 */
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
