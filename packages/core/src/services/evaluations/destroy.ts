import { eq } from 'drizzle-orm'

import { Evaluation } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluations } from '../../schema'

export function destroyEvaluation(
  { evaluation }: { evaluation: Evaluation },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(evaluations)
      .where(eq(evaluations.id, evaluation.id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  }, db)
}
