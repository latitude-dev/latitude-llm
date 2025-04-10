import { RunError, RunErrorInsert } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
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
