import type { ToolDefinition } from "../entities/span.ts"

/**
 * Normalizes a raw tool definition object from any convention into our canonical flat shape.
 *
 * Handles three convention variants:
 *  - Wrapped:       { type: "function", function: { name, description, parameters } }
 *  - Flat with type: { type: "function", name, description, parameters }
 *  - Flat:          { name, description, parameters }
 *
 * The schema lives under `parameters` (OpenAI/OTEL GenAI), `inputSchema` (Vercel AI SDK v5+
 * `LanguageModelV*FunctionTool`) or `input_schema` (Anthropic's Messages API); we read whichever is
 * present. Missing the Anthropic spelling imported every Anthropic-dialect tool with a name and a
 * description but no parameters at all.
 */
const schemaOf = (obj: Record<string, unknown>): unknown => obj.parameters ?? obj.inputSchema ?? obj.input_schema

export function toToolDefinition(raw: unknown): ToolDefinition | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  if (typeof obj.function === "object" && obj.function !== null) {
    const fn = obj.function as Record<string, unknown>
    if (typeof fn.name !== "string") return undefined
    return { name: fn.name, description: String(fn.description ?? ""), parameters: schemaOf(fn) }
  }

  if (typeof obj.name !== "string") return undefined
  return { name: obj.name, description: String(obj.description ?? ""), parameters: schemaOf(obj) }
}

const tryParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const parsedObject = (payload: unknown): Record<string, unknown> | undefined => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined
  return payload as Record<string, unknown>
}

const declaredTools = (payload: unknown): ToolDefinition[] => {
  const value = typeof payload === "string" ? tryParse(payload) : payload
  // Either a request body holding `tools`, or the tool array itself — which is what
  // `gen_ai.tool.definitions` is, and how a vendor hands it back out of its metadata map.
  const tools = Array.isArray(value) ? value : parsedObject(value)?.tools
  if (!Array.isArray(tools)) return []
  return tools.map(toToolDefinition).filter((tool): tool is ToolDefinition => tool !== undefined)
}

/**
 * Tool definitions from the first of several candidate payloads that declares any.
 *
 * A source that records a whole request body keeps `tools` next to `messages`; one that records
 * the call's arguments separately keeps them there instead (LangSmith's `invocation_params`).
 * Callers pass every place their source might hold them, most specific first. No `tools` anywhere
 * is an absence rather than a failure.
 */
export function toolDefinitionsFrom(...payloads: readonly unknown[]): ToolDefinition[] {
  for (const payload of payloads) {
    const tools = declaredTools(payload)
    if (tools.length > 0) return tools
  }
  return []
}
