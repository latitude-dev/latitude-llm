import { BUILTIN_FIELDS, type BuiltinField, type DatasetColumn } from "./entities/dataset.ts"
import type { RowFieldValue } from "./entities/dataset-row.ts"

const BUILTIN_DISPLAY_NAMES: Record<BuiltinField, string> = {
  input: "Input",
  output: "Output",
  expectedOutput: "Expected output",
  metadata: "Metadata",
}

/** The four built-in descriptors, all visible — the implicit schema when `columns` is null. */
export const defaultBuiltinColumns = (): DatasetColumn[] =>
  BUILTIN_FIELDS.map((field) => ({
    identifier: field,
    name: BUILTIN_DISPLAY_NAMES[field],
    source: { kind: "builtin", field } as const,
  }))

/**
 * The full stored descriptor list including soft-removed columns — or the implicit built-in schema
 * when null. Use this for persistence (so removed entries survive an edit); use {@link effectiveColumns}
 * for reads/projection.
 */
export const materializeColumns = (columns: DatasetColumn[] | null): DatasetColumn[] =>
  columns ?? defaultBuiltinColumns()

/** The active schema: the stored list minus soft-removed columns, or the implicit built-in schema when null. */
export const effectiveColumns = (columns: DatasetColumn[] | null): DatasetColumn[] =>
  materializeColumns(columns).filter((c) => !c.removed)

export interface WritableColumns {
  readonly writableBuiltins: ReadonlySet<BuiltinField>
  readonly writableCustomIds: ReadonlySet<string>
}

/** Partitions the active schema into what a row write may target. Removed columns are not writable. */
export const writableColumns = (columns: DatasetColumn[] | null): WritableColumns => {
  const cols = effectiveColumns(columns)
  const writableBuiltins = new Set<BuiltinField>()
  const writableCustomIds = new Set<string>()
  for (const col of cols) {
    if (col.source.kind === "builtin") {
      writableBuiltins.add(col.source.field)
    } else {
      writableCustomIds.add(col.identifier)
    }
  }
  return { writableBuiltins, writableCustomIds }
}

export interface VisibleRow {
  input?: RowFieldValue
  output?: RowFieldValue
  expectedOutput?: RowFieldValue
  metadata?: RowFieldValue
  custom: Record<string, RowFieldValue>
}

/**
 * Projects a stored row against the schema for reads: omits removed built-in fields and keeps only
 * active custom values keyed by identifier. `columns` null ⇒ all four built-ins + empty `custom`.
 */
export const visibleRow = (
  row: {
    input: RowFieldValue
    output: RowFieldValue
    expectedOutput: RowFieldValue
    metadata: RowFieldValue
    custom: Record<string, RowFieldValue>
  },
  columns: DatasetColumn[] | null,
): VisibleRow => {
  const cols = effectiveColumns(columns)
  const result: VisibleRow = { custom: {} }
  for (const col of cols) {
    if (col.source.kind === "builtin") {
      result[col.source.field] = row[col.source.field]
    } else {
      result.custom[col.identifier] = row.custom[col.identifier] ?? ""
    }
  }
  return result
}
