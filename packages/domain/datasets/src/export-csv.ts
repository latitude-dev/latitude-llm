import Papa from "papaparse"
import type { DatasetRow } from "./entities/dataset-row.ts"

export interface CsvRow {
  readonly input: string
  readonly output: string
  readonly metadata: string
}

function fieldToString(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? null)
}

/**
 * Converts dataset rows to CSV row data (input, output, metadata as strings).
 * Use with a CSV serializer (e.g. Papa.unparse) to produce the final CSV string.
 */
export function rowsToCsvData(rows: readonly DatasetRow[]): CsvRow[] {
  return rows.map((r) => ({
    input: fieldToString(r.input),
    output: fieldToString(r.output),
    metadata: fieldToString(r.metadata),
  }))
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

const CSV_EXPORT_COLUMNS = ["input", "output", "metadata"] as const

/**
 * Returns the CSV header line for dataset export (input, output, metadata).
 * Use with rowsToCsvFragment to build CSV incrementally.
 */
export function csvExportHeader(): string {
  return [...CSV_EXPORT_COLUMNS].join(",")
}

/**
 * Returns CSV lines for the given rows without a header. Concatenate with
 * csvExportHeader() + rowsToCsvFragment(batch1) + rowsToCsvFragment(batch2) + ...
 * for streaming export without holding all rows in memory.
 */
export function rowsToCsvFragment(rows: readonly DatasetRow[]): string {
  if (rows.length === 0) return ""
  const csvData = rowsToCsvData(rows)
  return Papa.unparse(csvData, { columns: [...CSV_EXPORT_COLUMNS], header: false })
}

/**
 * Builds a CSV string and safe filename for a dataset export.
 * Use for direct download (web) or upload + email (worker).
 */
export function buildDatasetCsvExport(datasetName: string, rows: readonly DatasetRow[]): DatasetCsvExport {
  const csvData = rowsToCsvData(rows)
  const csv = Papa.unparse(csvData)
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
