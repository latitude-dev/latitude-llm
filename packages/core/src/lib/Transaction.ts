import { Database } from '$core/client'
import { ConflictError } from '$core/lib/errors'
import { ErrorResult, Result, TypedResult } from '$core/lib/Result'
import * as schema from '$core/schema'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import { DatabaseError } from 'pg'

export type DBSchema = typeof schema
export type ITransaction<T extends DBSchema = DBSchema> = PgTransaction<
  PgQueryResultHKT,
  T,
  ExtractTablesWithRelations<typeof schema>
>
export type PromisedResult<F> = Promise<TypedResult<F, Error>>

const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  TRANSACTION_ABORTED: '25P02',
}

export default class Transaction {
  public static async call<ResultType>(
    db: Database,
    callback: (trx: Database) => PromisedResult<ResultType>,
  ): PromisedResult<ResultType> {
    return new Transaction().call(db, callback)
  }

  public async call<ResultType>(
    db: Database,
    callback: (trx: Database) => PromisedResult<ResultType>,
  ): PromisedResult<ResultType> {
    try {
      let result: TypedResult<ResultType, Error>
      await db.transaction(async (trx) => (result = await callback(trx)))

      return result!
    } catch (error) {
      return this.toResultError(error)
    }
  }

  /**
   * Refer to the errors list at
   * https://github.com/rails/rails/blob/main/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb#L769.
   */
  private toResultError(error: unknown): ErrorResult<Error> {
    const code = (error as DatabaseError)?.code
    switch (code) {
      case DB_ERROR_CODES.UNIQUE_VIOLATION:
        return Result.error(new ConflictError('Database conflict'))
      default:
        return Result.error(error as Error)
    }
  }
}
