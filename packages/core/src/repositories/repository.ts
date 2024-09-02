import { ColumnsSelection, eq } from 'drizzle-orm'
import { PgSelect, SubqueryWithSelection } from 'drizzle-orm/pg-core'

import { database } from '../client'
import { NotFoundError, Result } from '../lib'

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

  abstract get scope(): SubqueryWithSelection<U, string>

  async find(id: string | number) {
    const result = await this.db
      .select()
      .from(this.scope)
      // TODO: This is correct but I don't have time to fix the type
      //
      // @ts-expect-error
      .where(eq(this.scope.id, id))
      .limit(1)
    if (!result[0])
      return Result.error(new NotFoundError(`Record with id ${id} not found`))

    return Result.ok(result[0])
  }

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
  }
}
