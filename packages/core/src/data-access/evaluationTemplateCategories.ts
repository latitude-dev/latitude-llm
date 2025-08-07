import { eq } from 'drizzle-orm'

import type { EvaluationTemplateCategory } from '../browser'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, type TypedResult } from '../lib/Result'
import { evaluationTemplateCategories } from '../schema'

export async function findEvaluationTemplateCategoryById(
  id: number,
  db = database,
): Promise<TypedResult<EvaluationTemplateCategory, Error>> {
  const result = await db.query.evaluationTemplateCategories.findFirst({
    where: eq(evaluationTemplateCategories.id, id),
  })

  if (!result) {
    return Result.error(new NotFoundError('Evaluation template category not found'))
  }

  return Result.ok(result)
}
