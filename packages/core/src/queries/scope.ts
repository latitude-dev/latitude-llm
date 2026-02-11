import { and, eq, inArray, SQL } from 'drizzle-orm'
import { PgColumn, PgSelect } from 'drizzle-orm/pg-core'

import { Database, database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'

export type QueryOptions = {
  limit?: number
  offset?: number
}

export type Scope<TResult extends Record<string, unknown>> = {
  workspaceId: number
  db: Database
  filter: SQL<unknown> | undefined
  base(): PgSelect
  where(...conditions: (SQL<unknown> | undefined)[]): PgSelect
}

export type UnsafeScope<TResult extends Record<string, unknown>> = {
  db: Database
  base(): PgSelect
  where(...conditions: (SQL<unknown> | undefined)[]): PgSelect
}

/**
 * Creates a workspace-scoped query factory.
 * The `from` callback must return a dynamic query (call `.$dynamic()` at the end).
 */
export function scope<TResult extends Record<string, unknown>>(config: {
  from: (db: Database) => PgSelect
  tenancyFilter: (workspaceId: number) => SQL<unknown> | undefined
}) {
  return function createScope(
    workspaceId: number,
    db: Database = database,
  ): Scope<TResult> {
    const filter = config.tenancyFilter(workspaceId)

    return {
      workspaceId,
      db,
      filter,
      base() {
        return config.from(db).where(filter)
      },
      where(...conditions: (SQL<unknown> | undefined)[]) {
        return config.from(db).where(and(filter, ...conditions))
      },
    }
  }
}

/**
 * Creates a non-tenanted query factory (no workspace scoping).
 * The `from` callback must return a dynamic query (call `.$dynamic()` at the end).
 */
export function unsafeScope<TResult extends Record<string, unknown>>(config: {
  from: (db: Database) => PgSelect
}) {
  return function createUnsafeScope(
    db: Database = database,
  ): UnsafeScope<TResult> {
    return {
      db,
      base() {
        return config.from(db)
      },
      where(...conditions: (SQL<unknown> | undefined)[]) {
        return config.from(db).where(and(...conditions))
      },
    }
  }
}

export async function findAll<TResult extends Record<string, unknown>>(
  s: Scope<TResult> | UnsafeScope<TResult>,
  opts: QueryOptions = {},
): Promise<TypedResult<TResult[]>> {
  let query = s.base()
  if (opts.limit !== undefined) query = query.limit(opts.limit)
  if (opts.offset !== undefined) query = query.offset(opts.offset)
  return Result.ok((await query) as TResult[])
}

export async function findById<TResult extends Record<string, unknown>>(
  s: Scope<TResult> | UnsafeScope<TResult>,
  idColumn: PgColumn,
  id: string | number | null | undefined,
): Promise<TypedResult<TResult>> {
  const rows = await s.where(eq(idColumn, id!)).limit(1)
  const row = rows[0]
  if (!row)
    return Result.error(new NotFoundError(`Record with id ${id} not found`))
  return Result.ok(row as TResult)
}

export async function findMany<TResult extends Record<string, unknown>>(
  s: Scope<TResult> | UnsafeScope<TResult>,
  idColumn: PgColumn,
  ids: (string | number)[],
): Promise<TypedResult<TResult[]>> {
  const rows = await s.where(inArray(idColumn, ids)).limit(ids.length)
  return Result.ok(rows as TResult[])
}

export async function findFirst<TResult extends Record<string, unknown>>(
  s: Scope<TResult> | UnsafeScope<TResult>,
): Promise<TypedResult<TResult | undefined>> {
  const rows = await s.base().limit(1)
  return Result.ok(rows[0] as TResult | undefined)
}
