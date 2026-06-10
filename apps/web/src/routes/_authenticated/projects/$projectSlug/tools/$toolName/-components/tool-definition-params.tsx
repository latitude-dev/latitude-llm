import { CodeBlock, Status, Text, Tooltip } from "@repo/ui"
import { useMemo } from "react"

interface ParameterEntry {
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly description: string
  /** Enum values, when the schema constrains them. */
  readonly options: readonly string[]
}

interface ParsedParameters {
  readonly entries: readonly ParameterEntry[]
}

function schemaTypeLabel(schema: Record<string, unknown>): string {
  const type = schema.type
  if (typeof type === "string") {
    if (type === "array") {
      const items = schema.items
      if (items && typeof items === "object" && typeof (items as Record<string, unknown>).type === "string") {
        return `${(items as Record<string, unknown>).type}[]`
      }
      return "array"
    }
    return type
  }
  if (Array.isArray(type)) return type.filter((t) => typeof t === "string").join(" | ")
  if (Array.isArray(schema.enum)) return "enum"
  if (schema.anyOf || schema.oneOf) return "union"
  return "any"
}

/**
 * Parses a JSON-Schema-shaped `parameters` object ({ type: "object",
 * properties, required }) into displayable rows. Returns null for anything
 * else so the caller can fall back to the raw payload.
 */
function parseParameters(parameters: unknown): ParsedParameters | null {
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return null
  const schema = parameters as Record<string, unknown>
  const properties = schema.properties
  if (properties === undefined) {
    // An empty schema is valid — the tool simply takes no arguments.
    return Object.keys(schema).every((key) => key === "type" || key === "required" || key === "additionalProperties")
      ? { entries: [] }
      : null
  }
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) return null

  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === "string") : [])
  const entries = Object.entries(properties as Record<string, unknown>).map(([name, rawProperty]): ParameterEntry => {
    const property =
      rawProperty !== null && typeof rawProperty === "object" && !Array.isArray(rawProperty)
        ? (rawProperty as Record<string, unknown>)
        : {}
    return {
      name,
      type: schemaTypeLabel(property),
      required: required.has(name),
      description: typeof property.description === "string" ? property.description : "",
      options: Array.isArray(property.enum) ? property.enum.map(String) : [],
    }
  })
  return { entries }
}

/**
 * The tool's input parameters as a readable list (name, type, required,
 * description) instead of a raw JSON blob. Non-JSON-Schema shapes fall back
 * to the verbatim payload.
 */
export function ToolDefinitionParams({ definitionJson }: { readonly definitionJson: string }) {
  const { parsed, rawParametersJson } = useMemo(() => {
    try {
      const definition = JSON.parse(definitionJson) as Record<string, unknown>
      return {
        parsed: parseParameters(definition.parameters),
        rawParametersJson: JSON.stringify(definition.parameters ?? null, null, 2),
      }
    } catch {
      return { parsed: null, rawParametersJson: definitionJson }
    }
  }, [definitionJson])

  if (!parsed) {
    return (
      <div className="max-h-[320px] min-h-0 overflow-y-auto">
        <CodeBlock value={rawParametersJson} className="bg-secondary" />
      </div>
    )
  }

  if (parsed.entries.length === 0) {
    return <Text.H6 color="foregroundMuted">This tool takes no parameters.</Text.H6>
  }

  return (
    <div className="flex max-h-[320px] min-h-0 flex-col divide-y divide-border/60 overflow-y-auto">
      {parsed.entries.map((entry) => (
        <div key={entry.name} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <Text.H6 color="foreground" className="min-w-0 truncate font-mono">
              {entry.name}
            </Text.H6>
            {entry.options.length > 0 ? (
              <Tooltip asChild trigger={<Status variant="neutral" label={entry.type} indicator={false} />}>
                <div className="flex flex-col gap-0.5">
                  <Text.H6 color="foregroundMuted">Allowed values</Text.H6>
                  {entry.options.map((option) => (
                    <Text.H6B key={option} className="font-mono">
                      {option}
                    </Text.H6B>
                  ))}
                </div>
              </Tooltip>
            ) : (
              <Status variant="neutral" label={entry.type} indicator={false} />
            )}
            {entry.required ? <Status variant="info" label="required" indicator={false} /> : null}
          </div>
          {entry.description ? <Text.H6 color="foregroundMuted">{entry.description}</Text.H6> : null}
        </div>
      ))}
    </div>
  )
}
