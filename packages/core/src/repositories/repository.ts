import { Subquery } from 'drizzle-orm'
import { PgSelect } from 'drizzle-orm/pg-core'

import { database } from '../client'

export type PaginationArgs = { page?: number; pageSize?: number }
export default abstract class Repository {
  protected workspaceId: number
  protected db = database

  constructor(workspaceId: number, db = database) {
    this.workspaceId = workspaceId
    this.db = db
  }

  /**
   * This use $dynamic() query
   * https://orm.drizzle.team/docs/dynamic-query-building
   */
  static async paginateQuery<T extends PgSelect>({
    query,
    page = 1,
    pageSize = 20,
  }: {
    query: T
  } & PaginationArgs) {
    return query.limit(pageSize).offset((page - 1) * pageSize)
  }

  abstract get scope(): Subquery
}
