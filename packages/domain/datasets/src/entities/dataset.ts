import type { DatasetId, DatasetVersionId, OrganizationId, ProjectId } from "@domain/shared"
import { defineErrorDynamic } from "@domain/shared"

export interface Dataset {
  readonly id: DatasetId
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly description: string | null
  readonly fileKey: string | null
  readonly currentVersion: number
  readonly latestVersionId: DatasetVersionId | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface DatasetVersion {
  readonly id: DatasetVersionId
  readonly datasetId: DatasetId
  readonly version: number
  readonly rowsInserted: number
  readonly rowsUpdated: number
  readonly rowsDeleted: number
  readonly source: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class DatasetNotFoundError extends defineErrorDynamic(
  "DatasetNotFoundError",
  404,
  (f: { datasetId: string }) => `Dataset ${f.datasetId} not found`,
)<{
  readonly datasetId: string
}> {}

export class DuplicateDatasetNameError extends defineErrorDynamic(
  "DuplicateDatasetNameError",
  409,
  (f: { name: string }) => `A dataset named "${f.name}" already exists in this project`,
)<{
  readonly projectId: string
  readonly name: string
}> {}
