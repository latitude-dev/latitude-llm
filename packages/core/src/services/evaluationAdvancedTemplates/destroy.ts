import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluationAdvancedTemplates } from '../../schema'

export function destroyEvaluationTemplate(
  { id }: { id: number },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(evaluationAdvancedTemplates)
      .where(eq(evaluationAdvancedTemplates.id, id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  }, db)
}
