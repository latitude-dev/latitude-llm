import { eq, sql } from 'drizzle-orm'

import { Dataset } from '../browser'
import { datasets, users } from '../schema'
import Repository from './repository'

export const datasetColumns = {
  id: datasets.id,
  name: datasets.name,
  workspaceId: datasets.workspaceId,
  authorId: datasets.authorId,
  fileKey: datasets.fileKey,
  fileMetadata: datasets.fileMetadata,
  createdAt: datasets.createdAt,
  updatedAt: datasets.updatedAt,
  author: {
    id: sql`${users.id}`.as('users_id'),
    name: sql`${users.name}`.as('users_name'),
  },
}
export class DatasetsRepository extends Repository<
  typeof datasetColumns,
  Dataset
> {
  get scope() {
    return this.db
      .select(datasetColumns)
      .from(datasets)
      .leftJoin(users, eq(users.id, datasets.authorId))
      .where(eq(datasets.workspaceId, this.workspaceId))
      .as('datasetsScope')
  }
}
