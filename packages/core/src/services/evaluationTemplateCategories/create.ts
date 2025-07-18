import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationTemplateCategories } from '../../schema'
type Props = {
  name: string
}

export async function createEvaluationTemplateCategory(
  { name }: Props,
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationTemplateCategories)
      .values({
        name,
      })
      .returning()

    return Result.ok(result[0]!)
  })
}
