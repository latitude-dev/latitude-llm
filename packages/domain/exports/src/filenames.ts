import type { ExportKind } from "./entities.ts"

/**
 * Sanitizes a name for use in a filename (alphanumeric, spaces to underscores).
 */
export function sanitizeExportFilename(name: string): string {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_") || "export"
}

/**
 * Builds a filename for an export artifact.
 * All exports are compressed as `.csv.gz`.
 */
export function buildExportFilename(kind: ExportKind, name: string): string {
  const safeName = sanitizeExportFilename(name)
  return `${safeName}_${kind}_export.csv.gz`
}

/**
 * Builds a filename for a dataset export.
 */
export function buildDatasetExportFilename(datasetName: string): string {
  return buildExportFilename("dataset", datasetName)
}

/**
 * Builds a filename for a traces export.
 */
export function buildTracesExportFilename(projectName: string): string {
  return buildExportFilename("traces", projectName)
}

/**
 * Builds a filename for an issues export.
 */
export function buildIssuesExportFilename(projectName: string): string {
  return buildExportFilename("issues", projectName)
}
