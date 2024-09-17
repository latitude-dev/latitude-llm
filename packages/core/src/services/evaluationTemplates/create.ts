import { EvaluationResultConfiguration } from '../../browser'
import { database } from '../../client'
import { findEvaluationTemplateCategoryById } from '../../data-access/evaluationTemplateCategories'
import { NotFoundError, Result, Transaction } from '../../lib'
import { evaluationTemplates } from '../../schema'
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
  db = database,
) {
  return await Transaction.call(async (tx) => {
    let category

    if (categoryId) {
      const categoryResult = await findEvaluationTemplateCategoryById(
        categoryId,
        tx,
      )

      if (categoryResult.error instanceof NotFoundError) {
        category = await createCategory(categoryName, tx)
      } else if (categoryResult.error) {
        return categoryResult
      } else {
        category = categoryResult.value
      }
    } else {
      category = await createCategory(categoryName, tx)
    }

    const result = await tx
      .insert(evaluationTemplates)
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
  }, db)
}

async function createCategory(categoryName: string | undefined, tx = database) {
  const newCategoryResult = await createEvaluationTemplateCategory(
    { name: categoryName || DEFAULT_CATEGORY_NAME },
    tx,
  )

  return newCategoryResult.unwrap()
}
