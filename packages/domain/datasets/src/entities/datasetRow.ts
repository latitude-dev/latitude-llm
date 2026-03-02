import type { DatasetId, DatasetRowId, OrganizationId } from "@domain/shared-kernel"

export type DatasetRowDataContent = string | number | boolean | object | null | undefined

export type DatasetRowData = {
  [key: string]: DatasetRowDataContent
}

/**
 * Dataset row entity - represents a single row of data within a dataset.
 *
 * Each dataset has multiple rows, but each row belongs to one dataset. */

export interface DatasetRow {
  readonly id: DatasetRowId
  readonly organizationId: OrganizationId
  readonly datasetId: DatasetId
  readonly rowData: DatasetRowData
  readonly createdAt: Date
  readonly updatedAt: Date
}
