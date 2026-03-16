import type { ToolDefinition } from "../../entities/span.ts"

/**
 * Normalizes a raw tool definition object from any convention into our canonical flat shape.
 *
 * Handles three convention variants:
 *  - Wrapped:       { type: "function", function: { name, description, parameters } }
 *  - Flat with type: { type: "function", name, description, parameters }
 *  - Flat:          { name, description, parameters }
 */
export function toToolDefinition(raw: unknown): ToolDefinition | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  if (typeof obj.function === "object" && obj.function !== null) {
    const fn = obj.function as Record<string, unknown>
    if (typeof fn.name !== "string") return undefined
    return { name: fn.name, description: String(fn.description ?? ""), parameters: fn.parameters }
  }

  if (typeof obj.name !== "string") return undefined
  return { name: obj.name, description: String(obj.description ?? ""), parameters: obj.parameters }
}
