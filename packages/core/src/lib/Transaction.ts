import { PgTransaction } from 'drizzle-orm/pg-core'
import { type DatabaseError } from 'pg'

import { database, Database } from '../client'
import { ConflictError, UnprocessableEntityError } from './errors'
import { ErrorResult, Result, TypedResult } from './Result'
import { captureException } from '../utils/datadogCapture'

export type PromisedResult<F, E extends Error = Error> = Promise<
  TypedResult<F, E>
>

const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  INPUT_SYNTAX_ERROR: '22P02',
  TRANSACTION_ABORTED: '25P02',
  DEADLOCK_DETECTED: '40P01',
}

export default class Transaction {
  private db?: PgTransaction<any, any, any> | Database
  private callbacks: Array<(result: unknown, db: Database) => void> = []

  public async call<ResultType>(
    handler: (trx: Database) => PromisedResult<ResultType>,
    callback?: (result: ResultType) => void,
  ): PromisedResult<ResultType> {
    let result: TypedResult<ResultType, Error>

    if (this.db) {
      // @ts-expect-error - Database and PgTransaction are not the same type
      // but the mostly ducktype each other so we use them interchangeably
      result = await handler(this.db)

      if (result.error) throw result.error
      if (callback) this.callbacks.push(callback.bind(null, result.value))

      return result
    }

    const getPgErrorCode = (e: unknown) => {
      const cause =
        typeof e === 'object' && e && 'cause' in e
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((e as any).cause as unknown)
          : undefined

      return (
        (cause as DatabaseError | undefined)?.code ??
        (e as DatabaseError | undefined)?.code
      )
    }

    // Deadlocks are retryable.
    // We only retry when this Transaction instance created the DB transaction
    // (i.e. not when `this.db` is already set / nested transaction).
    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await database.transaction(async (trx) => {
          this.db = trx
          // @ts-expect-error - Database and PgTransaction are not the same type
          // but the mostly ducktype each other so we use them interchangeably
          result = await handler(this.db)

          if (result.error) throw result.error
          if (callback) this.callbacks.push(callback.bind(null, result.value))
        })

        this.callbacks.forEach((callback) => {
          try {
            // @ts-expect-error - we've bound the first argument of callback but TS can't see that
            callback()
          } catch (error) {
            captureException(error as Error)
          }
        })

        // @ts-expect-error - result is defined if we've reached this point but TS can't see that
        return result
      } catch (error) {
        const code = getPgErrorCode(error)
        const isDeadlock = code === DB_ERROR_CODES.DEADLOCK_DETECTED

        if (isDeadlock && attempt < maxAttempts) {
          // small exponential backoff with a bit of jitter
          const base = 50
          const backoffMs = Math.round(
            base * 2 ** (attempt - 1) + Math.random() * 50,
          )
          await new Promise((r) => setTimeout(r, backoffMs))
          continue
        }

        return Transaction.toResultError(error)
      } finally {
        // Ensure we don't leak a transaction handle across retries/calls
        this.db = undefined
        this.callbacks = []
      }
    }

    // Unreachable, but TS doesn't know.
    return Result.error(new Error('Transaction failed'))
  }

  /**
   * Refer to the errors list at
   * https://github.com/rails/rails/blob/main/activerecord/lib/active_record/connection_adapters/postgresql_adapter.rb#L769.
   */
  static toResultError(e: unknown): ErrorResult<Error> {
    const error = 'cause' in (e as Error) ? (e as Error).cause : undefined
    const code = (error as DatabaseError)?.code

    switch (code) {
      case DB_ERROR_CODES.UNIQUE_VIOLATION:
        return Result.error(new ConflictError((error as DatabaseError).message))
      case DB_ERROR_CODES.INPUT_SYNTAX_ERROR:
        return Result.error(
          new UnprocessableEntityError((error as DatabaseError).message, {
            details: (error as DatabaseError).message,
          }),
        )
      default:
        return Result.error((error as DatabaseError) ?? (e as Error))
    }
  }
}
