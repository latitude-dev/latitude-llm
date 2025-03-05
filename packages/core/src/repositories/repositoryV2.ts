import { and, eq, inArray, SQL } from 'drizzle-orm'
import { PgSelect } from 'drizzle-orm/pg-core'

import { database } from '../client'
import { NotFoundError, Result } from '../lib'

export type QueryOptions = {
  limit?: number
  offset?: number
}

export default abstract class Repository<T extends Record<string, unknown>> {
  protected workspaceId: number
  protected db = database
  abstract get scopeFilter(): SQL<unknown> | undefined

  constructor(workspaceId: number, db = database) {
    this.workspaceId = workspaceId
    this.db = db
  }

  abstract get scope(): PgSelect<string>

  async findAll(opts: QueryOptions = {}) {
    let query = this.scope
    if (opts.limit !== undefined) {
      query = this.scope.limit(opts.limit)
    }

    if (opts.offset !== undefined) {
      query = this.scope.offset(opts.offset)
    }

    return Result.ok((await query) as T[])
  }

  async find(id: string | number | undefined | null) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(this.scope._.selectedFields.id, id)))
      .limit(1)
    if (!result[0]) {
      return Result.error(new NotFoundError(`Record with id ${id} not found`))
    }

    return Result.ok(result[0]! as T)
  }

  async findMany(
    ids: (string | number)[],
    {
      ordering,
    }: {
      ordering?: SQL<unknown>[]
    } = {},
  ) {
    const result = await this.scope
      .where(
        and(this.scopeFilter, inArray(this.scope._.selectedFields.id, ids)),
      )
      .orderBy(...(ordering ?? []))
      .limit(ids.length)
    return Result.ok(result as T[])
  }

  async findFirst() {
    const result = await this.scope.limit(1)

    return Result.ok(result[0] as T | undefined)
  }
}
