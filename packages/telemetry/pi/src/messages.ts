import type { GenAIMessage, MessagePart, MessageRole } from "./types.ts"

const allowedRoles: ReadonlySet<MessageRole> = new Set(["system", "user", "assistant", "tool"])

export function normalizeMessages(raw: readonly unknown[] | undefined): GenAIMessage[] {
  const out: GenAIMessage[] = []
  for (const message of raw ?? []) {
    const normalized = normalizeMessage(message)
    if (normalized) out.push(normalized)
  }
  return out
}

export function normalizeMessage(raw: unknown): GenAIMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const rawRole = typeof obj.role === "string" ? obj.role : undefined

  if (rawRole === "toolResult") return normalizePiToolResult(obj)
  if (rawRole === "custom" || rawRole === "branchSummary" || rawRole === "compactionSummary") {
    return normalizeContentMessage("system", obj.content ?? obj.summary ?? raw)
  }
  if (rawRole === "bashExecution") return normalizeBashExecution(obj)

  const role = coerceRole(rawRole)
  if (Array.isArray(obj.parts)) {
    const parts = obj.parts.filter((part): part is MessagePart => part !== null && typeof part === "object")
    return { role, parts: parts.length > 0 ? parts : [{ type: "text", content: safeJson(raw) }] }
  }

  return normalizeContentMessage(role, obj.content ?? obj.text ?? obj.message ?? raw, obj)
}

export function userMessageFromPrompt(prompt: string, images: readonly unknown[] | undefined): GenAIMessage {
  const parts: MessagePart[] = []
  if (prompt.length > 0) parts.push({ type: "text", content: prompt })
  for (const image of images ?? []) {
    const part = normalizeImageBlock(image)
    if (part) parts.push(part)
  }
  if (parts.length === 0) parts.push({ type: "text", content: "" })
  return { role: "user", parts }
}

export function systemInstructionsParts(systemPrompt: string | undefined): MessagePart[] | undefined {
  if (!systemPrompt) return undefined
  return [{ type: "text", content: systemPrompt }]
}

function normalizeContentMessage(
  role: MessageRole,
  content: unknown,
  envelope?: Record<string, unknown>,
): GenAIMessage {
  if (typeof content === "string") {
    const parts: MessagePart[] = content.length > 0 ? [{ type: "text", content }] : []
    appendOpenAIToolCalls(parts, envelope?.tool_calls)
    return { role, parts: parts.length > 0 ? parts : [{ type: "text", content: "" }] }
  }

  if (Array.isArray(content)) {
    const parts: MessagePart[] = []
    for (const block of content) {
      const normalized = normalizeBlock(block)
      if (normalized) parts.push(normalized)
    }
    appendOpenAIToolCalls(parts, envelope?.tool_calls)
    return { role, parts: parts.length > 0 ? parts : [{ type: "text", content: safeJson(content) }] }
  }

  const parts: MessagePart[] = [{ type: "text", content: safeJson(content) }]
  appendOpenAIToolCalls(parts, envelope?.tool_calls)
  return { role, parts }
}

function normalizePiToolResult(obj: Record<string, unknown>): GenAIMessage {
  const toolCallId = typeof obj.toolCallId === "string" ? obj.toolCallId : ""
  return {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: toolCallId,
        response: toolResultValue(obj),
      },
    ],
  }
}

function normalizeBashExecution(obj: Record<string, unknown>): GenAIMessage {
  return {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: "user_bash",
        response: {
          command: obj.command,
          output: obj.output,
          exitCode: obj.exitCode,
          cancelled: obj.cancelled,
          truncated: obj.truncated,
        },
      },
    ],
  }
}

export function toolResultValue(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const obj = raw as Record<string, unknown>
  const content = contentToText(obj.content)
  const details = obj.details
  if (details === undefined) return content
  return { content, details }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return safeJson(content)
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block)
      continue
    }
    if (!block || typeof block !== "object") continue
    const obj = block as Record<string, unknown>
    if (obj.type === "text" && typeof obj.text === "string") {
      parts.push(obj.text)
    } else if (obj.type === "image") {
      parts.push("[image]")
    } else {
      parts.push(safeJson(obj))
    }
  }
  return parts.join("\n")
}

function normalizeBlock(raw: unknown): MessagePart | undefined {
  if (typeof raw === "string") return { type: "text", content: raw }
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const type = typeof obj.type === "string" ? obj.type : "text"

  if (type === "text") {
    const content =
      typeof obj.content === "string" ? obj.content : typeof obj.text === "string" ? obj.text : safeJson(raw)
    return { type: "text", content }
  }
  if (type === "thinking") {
    const content = typeof obj.thinking === "string" ? obj.thinking : typeof obj.content === "string" ? obj.content : ""
    return { type: "reasoning", content }
  }
  if (type === "reasoning") {
    return { type: "reasoning", content: typeof obj.content === "string" ? obj.content : safeJson(raw) }
  }
  if (type === "toolCall") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.arguments ?? {},
    }
  }
  if (type === "tool_call") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.arguments ?? obj.input ?? {},
    }
  }
  if (type === "tool_use") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.input ?? {},
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

  const image = normalizeImageBlock(obj)
  if (image) return image

  return { type, content: safeJson(raw) }
}

function normalizeImageBlock(raw: unknown): MessagePart | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  if (obj.type !== "image") return undefined

  const data = typeof obj.data === "string" ? obj.data : undefined
  const mimeType = typeof obj.mimeType === "string" ? obj.mimeType : undefined
  if (data) return { type: "uri", modality: "image", uri: `data:${mimeType ?? "image/unknown"};base64,${data}` }

  const source = obj.source
  if (source && typeof source === "object") {
    const src = source as Record<string, unknown>
    const url = typeof src.url === "string" ? src.url : undefined
    const sourceData = typeof src.data === "string" ? src.data : undefined
    const mediaType =
      typeof src.mediaType === "string"
        ? src.mediaType
        : typeof src.media_type === "string"
          ? src.media_type
          : undefined
    if (url) return { type: "uri", modality: "image", uri: url }
    if (sourceData)
      return { type: "uri", modality: "image", uri: `data:${mediaType ?? "image/unknown"};base64,${sourceData}` }
  }
  return undefined
}

function appendOpenAIToolCalls(parts: MessagePart[], raw: unknown): void {
  if (!Array.isArray(raw)) return
  for (const tc of raw) {
    if (!tc || typeof tc !== "object") continue
    const obj = tc as Record<string, unknown>
    const fn = obj.function && typeof obj.function === "object" ? (obj.function as Record<string, unknown>) : undefined
    let parsedArgs = fn?.arguments
    if (typeof parsedArgs === "string") {
      try {
        parsedArgs = JSON.parse(parsedArgs) as unknown
      } catch {
        // Keep the original string when the provider sent non-JSON arguments.
      }
    }
    parts.push({
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof fn?.name === "string" ? fn.name : "",
      arguments: parsedArgs ?? {},
    })
  }
}

function coerceRole(role: string | undefined): MessageRole {
  return role && allowedRoles.has(role as MessageRole) ? (role as MessageRole) : "user"
}

export function safeJson(value: unknown): string {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
