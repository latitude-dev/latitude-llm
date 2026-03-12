export interface ColumnMapping {
  readonly input: string[]
  readonly output: string[]
  readonly metadata: string[]
}

export interface CsvTransformOptions {
  readonly flattenSingleColumn: boolean
  readonly autoParseJson: boolean
}

export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
  options: CsvTransformOptions,
): { input: Record<string, unknown>; output: Record<string, unknown>; metadata: Record<string, unknown> } {
  const pick = (columns: string[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const col of columns) {
      if (!(col in row)) continue
      const raw = row[col] as string
      result[col] = options.autoParseJson ? tryParseJson(raw) : raw
    }

    const firstCol = columns[0]
    if (options.flattenSingleColumn && columns.length === 1 && firstCol && firstCol in result) {
      return { value: result[firstCol] }
    }

    return result
  }

  return {
    input: pick(mapping.input),
    output: pick(mapping.output),
    metadata: pick(mapping.metadata),
  }
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "") return value
  if (trimmed === "null") return null
  if (trimmed === "true") return true
  if (trimmed === "false") return false

  const asNumber = Number(trimmed)
  if (trimmed !== "" && !Number.isNaN(asNumber)) return asNumber

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}
