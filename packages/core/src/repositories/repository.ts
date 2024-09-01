import { ColumnsSelection } from 'drizzle-orm'
import { PgSelect, SubqueryWithSelection } from 'drizzle-orm/pg-core'

import { database } from '../client'
import { Result } from '../lib'

export type PaginationArgs = { page?: number; pageSize?: number }

export default abstract class Repository<U extends ColumnsSelection> {
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

  abstract get scope(): SubqueryWithSelection<U, any>

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
  }
}
