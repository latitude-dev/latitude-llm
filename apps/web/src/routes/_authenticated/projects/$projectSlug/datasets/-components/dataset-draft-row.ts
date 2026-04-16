import { generateId } from "@domain/shared"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

const DATASET_DRAFT_ROW_PREFIX = "__draft__" as const

export function isDatasetDraftRowId(id: string): boolean {
  return id.startsWith(DATASET_DRAFT_ROW_PREFIX)
}

export function createDraftRowRecord(datasetId: string): DatasetRowRecord {
  const rowId = `${DATASET_DRAFT_ROW_PREFIX}${generateId()}`
  return {
    rowId,
    datasetId,
    input: "",
    output: "",
    metadata: "",
    createdAt: new Date().toISOString(),
    version: 0,
  }
}
