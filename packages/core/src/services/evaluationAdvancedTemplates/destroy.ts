import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationAdvancedTemplates } from '../../schema/legacyModels/evaluationAdvancedTemplates'

export function destroyEvaluationTemplate(
  { id }: { id: number },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .delete(evaluationAdvancedTemplates)
      .where(eq(evaluationAdvancedTemplates.id, id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  })
}
