import { eq, and, sql, getTableColumns, desc, isNull } from 'drizzle-orm'

import { type Dataset } from '../schema/models/types/Dataset'
import { DEFAULT_PAGINATION_SIZE } from '../constants'
import { datasets } from '../schema/models/datasets'
import { users } from '../schema/models/users'
import Repository from './repositoryV2'
import { calculateOffset } from '../lib/pagination/calculateOffset'

const datasetColumns = {
  ...getTableColumns(datasets),
  author: {
    id: sql<string>`${users.id}`.as('users_id'),
    name: sql<string>`${users.name}`.as('users_name'),
  },
}

export class DatasetsRepository extends Repository<Dataset> {
  get scopeFilter() {
    return eq(datasets.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(datasetColumns)
      .from(datasets)
      .leftJoin(users, eq(users.id, datasets.authorId))
      .where(this.scopeFilter)
      .$dynamic()
  }

  findByName(name: string) {
    return this.db
      .select(datasetColumns)
      .from(datasets)
      .leftJoin(users, eq(users.id, datasets.authorId))
      .where(
        and(
          this.scopeFilter,
          eq(datasets.name, name),
          isNull(datasets.deletedAt),
        ),
      )
  }

  findAllPaginated({
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
  }: {
    page?: string
    pageSize?: string
  }) {
    const offset = calculateOffset(page, pageSize)
    return this.scope
      .where(and(this.scopeFilter, isNull(datasets.deletedAt)))
      .limit(parseInt(pageSize))
      .offset(offset)
      .orderBy(desc(datasets.createdAt))
  }
}
