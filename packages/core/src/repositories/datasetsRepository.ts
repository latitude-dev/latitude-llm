import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm'

import { DEFAULT_PAGINATION_SIZE } from '../constants'
import { calculateOffset } from '../lib/pagination/calculateOffset'
import { datasets } from '../schema/models/datasets'
import { optimizations } from '../schema/models/optimizations'
import { type Dataset } from '../schema/models/types/Dataset'
import { users } from '../schema/models/users'
import Repository from './repositoryV2'

const datasetColumns = {
  ...getTableColumns(datasets),
  author: {
    id: sql<string>`${users.id}`.as('users_id'),
    name: sql<string>`${users.name}`.as('users_name'),
  },
}

export class DatasetsRepository extends Repository<Dataset> {
  get scopeFilter() {
    return and(
      eq(datasets.workspaceId, this.workspaceId),
      isNull(datasets.deletedAt),
    )
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
      .where(and(this.scopeFilter, eq(datasets.name, name)))
  }

  findAllPaginated({
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
  }: {
    page?: string
    pageSize?: string
  }) {
    const offset = calculateOffset(page, pageSize)

    const inOptimizations = this.db
      .select({ id: optimizations.trainsetId })
      .from(optimizations)
      .where(
        and(
          eq(optimizations.workspaceId, this.workspaceId),
          isNotNull(optimizations.trainsetId),
        ),
      )
      .union(
        this.db
          .select({ id: optimizations.testsetId })
          .from(optimizations)
          .where(
            and(
              eq(optimizations.workspaceId, this.workspaceId),
              isNotNull(optimizations.testsetId),
            ),
          ),
      )

    return this.db
      .select(datasetColumns)
      .from(datasets)
      .leftJoin(users, eq(users.id, datasets.authorId))
      .where(and(this.scopeFilter, notInArray(datasets.id, inOptimizations)))
      .limit(parseInt(pageSize))
      .offset(offset)
      .orderBy(desc(datasets.createdAt))
  }
}
