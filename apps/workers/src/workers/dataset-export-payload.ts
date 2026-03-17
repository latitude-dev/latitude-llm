import type { DatasetExportPayload } from "@platform/queue-redpanda"

export function isValidDatasetExportPayload(payload: unknown): payload is DatasetExportPayload {
  if (payload === null || typeof payload !== "object") return false
  const value = payload as Record<string, unknown>
  if (typeof value.datasetId !== "string") return false
  if (typeof value.organizationId !== "string") return false
  if (typeof value.projectId !== "string") return false
  if (typeof value.recipientEmail !== "string") return false
  return true
}

export function parseDatasetExportPayload(value: Buffer): DatasetExportPayload | null {
  try {
    const parsed = JSON.parse(value.toString("utf-8"))
    if (!isValidDatasetExportPayload(parsed)) return null
    return parsed
  } catch {
    return null
  }
}
