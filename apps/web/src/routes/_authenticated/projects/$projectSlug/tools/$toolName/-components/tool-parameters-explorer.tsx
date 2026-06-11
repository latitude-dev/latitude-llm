import { CopyableText, Skeleton, Status, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ChevronRightIcon, InfoIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { type ToolsTimeRange, useToolParameterStats } from "../../../../../../../domains/tools/tools.collection.ts"
import { TOOL_DETAIL_PANEL_MAX_HEIGHT } from "../../-components/tool-formatters.ts"
import { ValueBar } from "./value-bar.tsx"

interface DefinedParameter {
  readonly type: string
  readonly required: boolean
  readonly description: string
  /** Enum values, when the schema constrains them. */
  readonly options: readonly string[]
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
  return ""
}

function parseDefinedParameters(definitionJson: string): ReadonlyMap<string, DefinedParameter> {
  const result = new Map<string, DefinedParameter>()
  if (!definitionJson) return result
  try {
    const definition = JSON.parse(definitionJson) as Record<string, unknown>
    const parameters = definition.parameters
    if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return result
    const schema = parameters as Record<string, unknown>
    const properties = schema.properties
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)) return result
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r) => typeof r === "string") : [])
    for (const [name, rawProperty] of Object.entries(properties as Record<string, unknown>)) {
      const property =
        rawProperty !== null && typeof rawProperty === "object" && !Array.isArray(rawProperty)
          ? (rawProperty as Record<string, unknown>)
          : {}
      result.set(name, {
        type: schemaTypeLabel(property),
        required: required.has(name),
        description: typeof property.description === "string" ? property.description : "",
        options: Array.isArray(property.enum) ? property.enum.map(String) : [],
      })
    }
    return result
  } catch {
    return result
  }
}

interface MergedParameter {
  readonly name: string
  readonly defined: DefinedParameter | undefined
  /** Sampled calls whose input contains this parameter. */
  readonly observed: number
  readonly topValues: readonly { readonly value: string; readonly count: number }[]
}

function ParameterBadges({ defined }: { readonly defined: DefinedParameter | undefined }) {
  if (!defined) return null
  return (
    <>
      {defined.type ? (
        defined.options.length > 0 ? (
          <Tooltip asChild trigger={<Status variant="neutral" label={defined.type} indicator={false} />}>
            <div className="flex flex-col gap-0.5">
              <Text.H6 color="foregroundMuted">Allowed values</Text.H6>
              {defined.options.map((option) => (
                <Text.H6B key={option} className="font-mono">
                  {option}
                </Text.H6B>
              ))}
            </div>
          </Tooltip>
        ) : (
          <Status variant="neutral" label={defined.type} indicator={false} />
        )
      ) : null}
      {defined.description || defined.required ? (
        <Tooltip asChild trigger={<InfoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}>
          <div className="flex max-w-72 flex-col gap-0.5">
            {defined.description ? <Text.H6>{defined.description}</Text.H6> : null}
            {defined.required ? <Text.H6 color="foregroundMuted">Required</Text.H6> : null}
          </div>
        </Tooltip>
      ) : null}
    </>
  )
}

function ParameterValues({
  parameter,
  sampleSize,
}: {
  readonly parameter: MergedParameter
  readonly sampleSize: number
}) {
  const notIncluded = Math.max(0, sampleSize - parameter.observed)
  return (
    <>
      {parameter.topValues.map((value) => (
        <div key={value.value} className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <div className="min-w-0 flex-1">
              <CopyableText value={value.value} size="sm" ellipsis tooltip="Copy value" />
            </div>
            <Text.H6 color="foreground" className="shrink-0 tabular-nums">
              {formatCount(value.count)}
            </Text.H6>
          </div>
          <ValueBar fraction={value.count / sampleSize} />
        </div>
      ))}
      {notIncluded > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate italic">
              Not included
            </Text.H6>
            <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
              {formatCount(notIncluded)}
            </Text.H6>
          </div>
          <ValueBar fraction={notIncluded / sampleSize} muted />
        </div>
      ) : null}
    </>
  )
}

// "Not included" counts the sampled calls that omit a parameter, so
// defined-but-never-sent parameters read as "Not included · 100%".
export function ToolParametersExplorer({
  projectId,
  toolName,
  range,
  errorsOnly,
  definitionJson,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly errorsOnly: boolean
  readonly definitionJson: string
}) {
  const { data, isLoading } = useToolParameterStats({ projectId, toolName, range, errorsOnly })
  const sampleSize = data?.sampleSize ?? 0

  const parameters = useMemo<readonly MergedParameter[]>(() => {
    const defined = parseDefinedParameters(definitionJson)
    const observedRows = (data?.stats ?? []).map(
      (stat): MergedParameter => ({
        name: stat.key,
        defined: defined.get(stat.key),
        observed: stat.occurrences,
        topValues: stat.topValues,
      }),
    )
    const observedNames = new Set(observedRows.map((row) => row.name))
    const definedOnlyRows = [...defined.entries()]
      .filter(([name]) => !observedNames.has(name))
      .map(([name, def]): MergedParameter => ({ name, defined: def, observed: 0, topValues: [] }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...observedRows, ...definedOnlyRows]
  }, [data, definitionJson])

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const activeName =
    selectedName !== null && parameters.some((parameter) => parameter.name === selectedName)
      ? selectedName
      : parameters[0]?.name
  const active = parameters.find((parameter) => parameter.name === activeName)
  // With a single parameter there is nothing to select — skip the
  // master-detail split so the lone entry doesn't render as a pressed button.
  const single = parameters.length === 1 ? parameters[0] : undefined

  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 ${TOOL_DETAIL_PANEL_MAX_HEIGHT}`}>
      <div className="flex items-center justify-between">
        <Text.H6 color="foregroundMuted">Parameters</Text.H6>
        {sampleSize > 0 ? (
          <Text.H6 color="foregroundMuted">
            based on the most recent {formatCount(sampleSize)} {errorsOnly ? "failed calls" : "calls"}
          </Text.H6>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : parameters.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">
            {errorsOnly ? "No parameters recorded on failed calls" : "No parameters defined or recorded"}
          </Text.H6>
        </div>
      ) : single ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-row items-center gap-1.5">
            <Text.H6 color="foreground" className="min-w-0 truncate font-mono">
              {single.name}
            </Text.H6>
            <ParameterBadges defined={single.defined} />
          </div>
          {sampleSize === 0 ? (
            <Text.H6 color="foregroundMuted">
              {errorsOnly ? "No failed calls in this window." : "No calls in this window."}
            </Text.H6>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
              <ParameterValues parameter={single} sampleSize={sampleSize} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
          <div className="flex min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[280px] sm:w-[240px] sm:shrink-0 xl:max-h-none">
            {parameters.map((parameter) => {
              const isActive = parameter.name === activeName
              const isUnobserved = parameter.observed === 0 && sampleSize > 0
              return (
                <button
                  key={parameter.name}
                  type="button"
                  onClick={() => setSelectedName(parameter.name)}
                  aria-pressed={isActive}
                  className={`group relative flex flex-row items-center gap-1.5 rounded-md py-1.5 pl-3 pr-2 text-left transition-colors ${
                    isActive ? "bg-background" : "hover:bg-background/60"
                  } ${isUnobserved ? "opacity-60" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-1.5 left-1 w-0.5 rounded-full bg-primary ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <Text.H6 color="foreground" className="min-w-0 flex-1 truncate font-mono">
                    {parameter.name}
                  </Text.H6>
                  <ParameterBadges defined={parameter.defined} />
                  <ChevronRightIcon
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    }`}
                  />
                </button>
              )
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto border-t pt-3 sm:max-h-[280px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 xl:max-h-none">
            {active ? (
              sampleSize === 0 ? (
                <Text.H6 color="foregroundMuted">
                  {errorsOnly ? "No failed calls in this window." : "No calls in this window."}
                </Text.H6>
              ) : (
                <>
                  <Text.H6 color="foregroundMuted">
                    Top values of <span className="font-mono">{active.name}</span>
                  </Text.H6>
                  <ParameterValues parameter={active} sampleSize={sampleSize} />
                </>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
