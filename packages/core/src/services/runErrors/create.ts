import { RunError, RunErrorInsert } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { runErrors } from '../../schema'

export type CreateRunErrorProps = { data: RunErrorInsert }
export async function createRunError(
  { data }: CreateRunErrorProps,
  db = database,
) {
  return await Transaction.call<RunError>(async (trx) => {
    const inserts = await trx.insert(runErrors).values(data).returning()
    return Result.ok(inserts[0]!)
  }, db)
}
