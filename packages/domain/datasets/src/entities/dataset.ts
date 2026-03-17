import type { DatasetId, DatasetVersionId, OrganizationId, ProjectId } from "@domain/shared"
import { Data } from "effect"

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

export class DatasetNotFoundError extends Data.TaggedError("DatasetNotFoundError")<{
  readonly datasetId: string
}> {
  readonly httpStatus = 404
  get httpMessage() {
    return `Dataset ${this.datasetId} not found`
  }
}

export class DuplicateDatasetNameError extends Data.TaggedError("DuplicateDatasetNameError")<{
  readonly projectId: string
  readonly name: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return `A dataset named "${this.name}" already exists in this project`
  }
}
