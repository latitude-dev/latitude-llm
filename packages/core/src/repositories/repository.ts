import { ColumnsSelection, eq, inArray } from 'drizzle-orm'
import { SubqueryWithSelection } from 'drizzle-orm/pg-core'

import { database } from '../client'
import { NotFoundError, Result } from '../lib'

export type QueryOptions = {
  limit?: number
  offset?: number
}

export default abstract class Repository<
  U extends ColumnsSelection,
  T extends Record<string, unknown>,
> {
  protected workspaceId: number
  protected db = database

  constructor(workspaceId: number, db = database) {
    this.workspaceId = workspaceId
    this.db = db
  }

  abstract get scope(): SubqueryWithSelection<U, string>

  async findAll(opts: QueryOptions = {}) {
    let query = this.db.select().from(this.scope)

    if (opts.limit !== undefined) {
      // @ts-expect-error
      query = query.limit(opts.limit)
    }

    if (opts.offset !== undefined) {
      // @ts-expect-error
      query = query.offset(opts.offset)
    }

    const result = (await query) as unknown as T[]

    return Result.ok(result)
  }

  async find(id: string | number) {
    const result = await this.db
      .select()
      .from(this.scope)
      // TODO: This is correct but I don't have time to fix the types
      // as it involves some generics with the return value of scope
      // in the child classes
      //
      // @ts-expect-error
      .where(eq(this.scope.id, id))
      .limit(1)
    if (!result[0]) {
      return Result.error(new NotFoundError(`Record with id ${id} not found`))
    }

    return Result.ok(result[0]! as T)
  }

  async findMany(ids: (string | number)[]) {
    const result = await this.db
      .select()
      .from(this.scope)
      // @ts-expect-error
      .where(inArray(this.scope.id, ids))
      .limit(ids.length)

    if (!result.length) {
      const missingIds = ids
        // @ts-expect-error
        .filter((id) => !result.find((r) => r.id === id))
        .map((id) => "'" + id + "'")
        .join(', ')

      return Result.error(
        new NotFoundError(`Records with ids ${missingIds} not found`),
      )
    }

    return Result.ok(result as T[])
  }

  async findFirst() {
    const result = await this.db.select().from(this.scope).limit(1)

    return Result.ok(result[0] as T | undefined)
  }
}
