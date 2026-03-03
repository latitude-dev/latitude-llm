import type { DatasetId, OrganizationId, ProjectId } from "@domain/shared-kernel"

export const DATASET_COLUMN_ROLES = {
  parameter: 'parameter',
  label: 'label',
  metadata: 'metadata',
} as const

export type DatasetColumnRole =
  (typeof DATASET_COLUMN_ROLES)[keyof typeof DATASET_COLUMN_ROLES]

export type DatasetColumn = {
  identifier: string
  name: string
  role: DatasetColumnRole
}

/**
 * Dataset entity - represents a dataset within the project.
 *
 * Each project has multiple datasets, but each dataset belongs to one project.
 */
export interface Dataset {
  readonly id: DatasetId
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly slug: string
  readonly columns: DatasetColumn[]
  readonly createdAt: Date
  readonly updatedAt: Date
}
