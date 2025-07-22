import { RunError, RunErrorInsert } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { runErrors } from '../../schema'
export type CreateRunErrorProps = { data: RunErrorInsert }

export async function createRunError(
  { data }: CreateRunErrorProps,
  transaction = new Transaction(),
) {
  return await transaction.call<RunError>(async (trx) => {
    const inserts = await trx.insert(runErrors).values(data).returning()
    return Result.ok(inserts[0]! as RunError)
  })
}
