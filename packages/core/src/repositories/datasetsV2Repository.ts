import { eq, and, sql } from 'drizzle-orm'

import { DatasetV2, DEFAULT_PAGINATION_SIZE } from '../browser'
import { datasetsV2, users } from '../schema'
import Repository from './repositoryV2'
import { calculateOffset } from '../lib/pagination/calculateOffset'

const datasetColumns = {
  id: datasetsV2.id,
  name: datasetsV2.name,
  workspaceId: datasetsV2.workspaceId,
  authorId: datasetsV2.authorId,
  columns: datasetsV2.columns,
  createdAt: datasetsV2.createdAt,
  updatedAt: datasetsV2.updatedAt,
  author: {
    id: sql`${users.id}`.as('users_id'),
    name: sql`${users.name}`.as('users_name'),
  },
}
export class DatasetsV2Repository extends Repository<DatasetV2> {
  get scopeFilter() {
    return eq(datasetsV2.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(datasetColumns)
      .from(datasetsV2)
      .leftJoin(users, eq(users.id, datasetsV2.authorId))
      .where(this.scopeFilter)
      .$dynamic()
  }

  findByName(name: string) {
    return this.db
      .select(datasetColumns)
      .from(datasetsV2)
      .where(and(this.scopeFilter, eq(datasetsV2.name, name)))
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
      .where(and(this.scopeFilter))
      .limit(parseInt(pageSize))
      .offset(offset)
  }
}
