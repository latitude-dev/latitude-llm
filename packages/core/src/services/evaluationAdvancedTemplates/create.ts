import { EvaluationResultConfiguration } from '../../schema/types'
import { findEvaluationTemplateCategoryById } from '../../data-access/evaluationTemplateCategories'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationAdvancedTemplates } from '../../schema/legacyModels/evaluationAdvancedTemplates'
import { createEvaluationTemplateCategory } from '../evaluationTemplateCategories/create'

const DEFAULT_CATEGORY_NAME = 'Default Category'

type Props = {
  name: string
  description: string
  categoryId?: number
  categoryName?: string
  prompt: string
  configuration: EvaluationResultConfiguration
}

export async function createEvaluationTemplate(
  { name, description, categoryId, categoryName, configuration, prompt }: Props,
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    let category

    if (categoryId) {
      const categoryResult = await findEvaluationTemplateCategoryById(
        categoryId,
        tx,
      )

      if (categoryResult.error instanceof NotFoundError) {
        category = await createCategory(categoryName, transaction)
      } else if (categoryResult.error) {
        return categoryResult
      } else {
        category = categoryResult.value
      }
    } else {
      category = await createCategory(categoryName, transaction)
    }

    const result = await tx
      .insert(evaluationAdvancedTemplates)
      .values({
        name,
        description,
        categoryId: category.id,
        configuration,
        prompt,
      })
      .returning()

    return Result.ok({
      ...result[0]!,
      category: category.name,
    })
  })
}

async function createCategory(
  categoryName: string | undefined,
  transaction = new Transaction(),
) {
  const newCategoryResult = await createEvaluationTemplateCategory(
    { name: categoryName || DEFAULT_CATEGORY_NAME },
    transaction,
  )

  return newCategoryResult.unwrap()
}
