import { toolDefinitionSchema } from "@domain/spans"
import { Button } from "@repo/ui"
import { useMemo, useState } from "react"
import { ToolPill } from "../../../../tool-pills.tsx"
import { JsonBlock } from "./helpers.tsx"

function parameterCount(parameters: unknown): number | null {
  if (parameters === null || typeof parameters !== "object") return null
  const properties = (parameters as { properties?: unknown }).properties
  if (properties === null || typeof properties !== "object") return null
  return Object.keys(properties).length
}

export function ToolDefinitionPills({ definitions }: { readonly definitions: readonly object[] }) {
  const [showJson, setShowJson] = useState(false)
  const parsed = useMemo(
    () =>
      definitions.map((entry) => {
        const result = toolDefinitionSchema.safeParse(entry)
        if (result.success) return result.data
        const name = (entry as { name?: unknown }).name
        return {
          name: typeof name === "string" && name.length > 0 ? name : "unknown",
          description: "",
          parameters: undefined as unknown,
        }
      }),
    [definitions],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row flex-wrap items-center gap-1.5">
        {parsed.map((definition, index) => {
          const paramCount = parameterCount(definition.parameters)
          return (
            <ToolPill
              key={`${definition.name}-${index}`}
              name={definition.name}
              tooltip={
                <>
                  {definition.description ? <span className="line-clamp-4">{definition.description}</span> : null}
                  {paramCount !== null ? (
                    <span className="text-muted-foreground">
                      {paramCount} {paramCount === 1 ? "parameter" : "parameters"}
                    </span>
                  ) : null}
                </>
              }
            />
          )
        })}
        <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowJson((value) => !value)}>
          {showJson ? "Hide JSON" : "Show JSON"}
        </Button>
      </div>
      {showJson ? <JsonBlock value={definitions} /> : null}
    </div>
  )
}
