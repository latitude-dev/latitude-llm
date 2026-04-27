import type { ExportKind } from "./entities.ts"

/**
 * Sanitizes a name for use in a filename (alphanumeric, spaces to underscores).
 */
function sanitizeExportFilename(name: string): string {
  return name.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_") || "export"
}

function formatExportTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

/**
 * Builds a filename for an export artifact.
 * All exports are packaged as `.zip` archives containing a single `.csv` entry.
 */
function buildExportFilename(kind: ExportKind, name: string, at = new Date()): string {
  const safeName = sanitizeExportFilename(name)
  return `${safeName}_${kind}_export_${formatExportTimestamp(at)}.zip`
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
