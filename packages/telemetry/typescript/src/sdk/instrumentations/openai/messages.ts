/**
 * Shape converters for OpenAI request/response payloads → OTel GenAI parts shape.
 *
 * Latitude (and the OTel GenAI semantic conventions) expect `gen_ai.input.messages`
 * and `gen_ai.output.messages` to be JSON arrays of `{ role, parts: [{ type, content }] }`.
 * These helpers translate raw OpenAI shapes (Chat Completions or Responses API) into
 * that uniform structure so both the Responses instrumentation and the OpenAI Agents
 * trace processor emit messages the same way.
 */

interface ResponseUsage {
  input_tokens?: number
  output_tokens?: number
}

interface ResponseOutputBlock {
  type?: string
  role?: string
  content?: unknown
  text?: string
  name?: string
  arguments?: string
  call_id?: string
  id?: string
}

interface ResponseOutputContentItem {
  type?: string
  text?: string
}

export interface ResponseObject {
  id?: string
  model?: string
  output_text?: string
  output?: ResponseOutputBlock[]
  usage?: ResponseUsage
  status?: string
  incomplete_details?: { reason?: string }
}

interface ResponsesParams {
  input?: string | unknown[]
  instructions?: string
}

export function buildInputMessages(params: ResponsesParams): unknown[] {
  const messages: Array<{ role: string; parts: unknown[] }> = []
  if (params.instructions) {
    messages.push({
      role: "system",
      parts: [{ type: "text", content: params.instructions }],
    })
  }
  if (typeof params.input === "string") {
    messages.push({
      role: "user",
      parts: [{ type: "text", content: params.input }],
    })
  } else if (Array.isArray(params.input)) {
    for (const item of params.input) {
      messages.push(buildInputMessageFromItem(item))
    }
  }
  return messages
}

export function buildInputMessageFromItem(item: unknown): { role: string; parts: unknown[] } {
  const obj = (item ?? {}) as Record<string, unknown>
  const type = (obj.type as string) ?? "message"

  // Tool call request. The raw Responses API and the OpenAI Agents JS SDK both
  // use `type: "function_call"`, but the Agents SDK uses camelCase (`callId`)
  // while the Responses API uses snake_case (`call_id`).
  if (type === "function_call") {
    const callId = (obj.callId as string) ?? (obj.call_id as string) ?? (obj.id as string)
    return {
      role: "assistant",
      parts: [
        {
          type: "tool_call",
          name: obj.name,
          id: callId,
          arguments: parseMaybeJson(obj.arguments),
        },
      ],
    }
  }

  // Tool call result. The raw Responses API uses `function_call_output` +
  // `call_id` + string `output`; the Agents JS SDK uses `function_call_result`
  // + `callId` + `output` that can be either a string or a structured object
  // like `{ type: "text", text: "…" }` (or image/file variants we flatten as-is).
  if (type === "function_call_output" || type === "function_call_result") {
    const callId = (obj.callId as string) ?? (obj.call_id as string)
    return {
      role: "tool",
      parts: [{ type: "tool_call_response", id: callId, response: extractToolResultOutput(obj.output) }],
    }
  }

  const role = (obj.role as string) ?? "user"
  const content = obj.content
  const parts: unknown[] = []
  if (typeof content === "string") {
    parts.push({ type: "text", content })
  } else if (Array.isArray(content)) {
    for (const part of content) {
      const partObj = (part ?? {}) as Record<string, unknown>
      const partType = (partObj.type as string) ?? ""
      if (partType === "input_text" || partType === "output_text" || partType === "text") {
        parts.push({ type: "text", content: partObj.text ?? "" })
      } else {
        parts.push({ type: partType || "unknown", content: partObj })
      }
    }
  }
  return { role, parts }
}

function extractToolResultOutput(output: unknown): unknown {
  if (output === undefined || output === null) return ""
  if (typeof output === "string") return output
  if (typeof output === "object") {
    const out = output as Record<string, unknown>
    // `{ type: "text", text: "…" }` is the most common structured form; flatten it.
    if (typeof out.text === "string") return out.text
  }
  // Image / file payloads or anything else: pass through as-is so we don't
  // silently drop information.
  return output
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function deriveFinishReason(response: ResponseObject): string {
  const status = response.status
  if (status === "completed") {
    const hasToolCall = response.output?.some(
      (b) =>
        b.type === "function_call" ||
        b.type === "file_search_call" ||
        b.type === "web_search_call" ||
        b.type === "computer_call",
    )
    return hasToolCall ? "tool_call" : "stop"
  }
  if (status === "incomplete") {
    const reason = response.incomplete_details?.reason
    return reason === "content_filter" ? "content_filter" : "length"
  }
  if (status === "failed" || status === "cancelled") return "error"
  return ""
}

export function buildOutputMessages(response: ResponseObject): unknown[] {
  const parts: unknown[] = []
  const text = resolveOutputText(response)
  if (text) parts.push({ type: "text", content: text })
  for (const block of response.output ?? []) {
    if (block.type === "function_call") {
      parts.push({
        type: "tool_call",
        name: block.name,
        id: block.id,
        arguments: parseMaybeJson(block.arguments),
      })
    }
  }
  if (parts.length === 0) return []
  return [{ role: "assistant", parts, finish_reason: deriveFinishReason(response) }]
}

/**
 * Returns assistant text from a Responses-API response. Non-streaming responses
 * carry a top-level `output_text` shortcut populated by the SDK's parser, but
 * the streaming `response.completed` event payload does not — there we derive
 * the text by concatenating `output_text` items inside `output[]` message blocks
 * (mirroring what OpenAI's `addOutputText` parser does on the non-streaming path).
 */
export function resolveOutputText(response: ResponseObject): string {
  if (response.output_text) return response.output_text
  const chunks: string[] = []
  for (const block of response.output ?? []) {
    if (block.type !== "message") continue
    const content = block.content
    if (!Array.isArray(content)) continue
    for (const item of content as ResponseOutputContentItem[]) {
      if (item?.type === "output_text" && typeof item.text === "string") {
        chunks.push(item.text)
      }
    }
  }
  return chunks.join("")
}

/**
 * Convert a list of OpenAI message-shaped items (Chat Completions / Agents
 * `generation` payload) into the OTel GenAI parts shape.
 */
export function buildMessagesFromList(items: ReadonlyArray<Record<string, unknown>>): unknown[] {
  return items.map(buildInputMessageFromItem)
}
