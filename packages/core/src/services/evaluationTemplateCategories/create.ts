import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluationTemplateCategories } from '../../schema'

type Props = {
  name: string
}

export async function createEvaluationTemplateCategory(
  { name }: Props,
  db = database,
) {
  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationTemplateCategories)
      .values({
        name,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
