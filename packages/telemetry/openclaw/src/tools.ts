export interface ToolDefinition {
  type: "function"
  name: string
  description: string
  parameters?: unknown
}

/**
 * `llm_input.tools` is the post-policy tool list offered to the model, as
 * pi-ai `Tool` objects (`name`, `description`, `parameters` JSON schema) plus
 * runtime fields such as `execute` that never leave the process.
 */
export function toolDefinitionsFrom(raw: readonly unknown[] | undefined): ToolDefinition[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const out: ToolDefinition[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const fn = obj.function && typeof obj.function === "object" ? (obj.function as Record<string, unknown>) : obj
    if (typeof fn.name !== "string" || fn.name.length === 0) continue
    const parameters = fn.parameters ?? fn.inputSchema ?? fn.input_schema
    out.push({
      type: "function",
      name: fn.name,
      description: typeof fn.description === "string" ? fn.description : "",
      ...(parameters !== undefined ? { parameters: plainSchema(parameters) } : {}),
    })
  }
  return out.length > 0 ? out : undefined
}

// TypeBox schemas carry symbol keys and are otherwise plain JSON; a round trip drops the symbols.
function plainSchema(schema: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(schema))
  } catch {
    return undefined
  }
}
