import Papa from "papaparse"
import { effectiveColumns } from "./columns.ts"
import type { BuiltinField, DatasetColumn } from "./entities/dataset.ts"
import type { DatasetRow } from "./entities/dataset-row.ts"

function fieldToString(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? null)
}

// Built-in fields keep their canonical snake_case CSV headers (the names the import mapper recognizes);
// custom columns export under their display name.
const BUILTIN_CSV_HEADER: Record<BuiltinField, string> = {
  input: "input",
  output: "output",
  expectedOutput: "expected_output",
  metadata: "metadata",
}

interface ExportColumn {
  readonly header: string
  readonly value: (row: DatasetRow) => unknown
}

/**
 * The CSV columns for an export, honoring the dataset's active schema: built-in + custom columns in
 * schema order, excluding soft-removed ones. `null` ⇒ the four built-in fields (today's default).
 */
export function exportColumns(columns: DatasetColumn[] | null): ExportColumn[] {
  return effectiveColumns(columns).map((col) => {
    if (col.source.kind === "builtin") {
      const field = col.source.field
      return { header: BUILTIN_CSV_HEADER[field], value: (row: DatasetRow) => row[field] }
    }
    const identifier = col.identifier
    return { header: col.name, value: (row: DatasetRow) => row.custom[identifier] ?? "" }
  })
}

/**
 * Sanitizes a dataset name for use in a filename (alphanumeric, spaces to underscores).
 */
export function sanitizeDatasetFilename(name: string): string {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_") || "dataset"
}

export interface DatasetCsvExport {
  readonly csv: string
  readonly filename: string
}

/**
 * Returns the CSV header line for a dataset export. Pass the dataset's `columns` to honor its active
 * schema; omit (or `null`) for the default four built-in fields. Use with rowsToCsvFragment.
 */
export function csvExportHeader(columns: DatasetColumn[] | null = null): string {
  return Papa.unparse([exportColumns(columns).map((c) => c.header)])
}

/**
 * Returns CSV lines for the given rows without a header. Concatenate with
 * csvExportHeader(columns) + rowsToCsvFragment(batch1, columns) + ... for streaming export.
 * `columns` must match the header's.
 */
export function rowsToCsvFragment(rows: readonly DatasetRow[], columns: DatasetColumn[] | null = null): string {
  if (rows.length === 0) return ""
  const cols = exportColumns(columns)
  return Papa.unparse(rows.map((row) => cols.map((c) => fieldToString(c.value(row)))))
}

/**
 * Builds a CSV string and safe filename for a dataset export, honoring the dataset's active columns.
 * Use for direct download (web) or upload + email (worker).
 */
export function buildDatasetCsvExport(
  datasetName: string,
  rows: readonly DatasetRow[],
  columns: DatasetColumn[] | null = null,
): DatasetCsvExport {
  const cols = exportColumns(columns)
  const csv = Papa.unparse([
    cols.map((c) => c.header),
    ...rows.map((row) => cols.map((c) => fieldToString(c.value(row)))),
  ])
  const filename = `${sanitizeDatasetFilename(datasetName)}.csv`
  return { csv, filename }
}

export interface ParsedDatasetCsv {
  readonly headers: string[]
  readonly rows: Record<string, string>[]
}

/**
 * Parses a CSV string (with header row) into column names and row objects.
 * Use for upload preview and for saving CSV data into a dataset.
 */
export function parseDatasetCsv(content: string): ParsedDatasetCsv {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  }
}
