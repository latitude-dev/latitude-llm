import { evaluationAdvancedTemplates } from '../schema/legacyModels/evaluationAdvancedTemplates'
import { evaluationTemplateCategories } from '../schema/legacyModels/evaluationTemplateCategories'
import { asc, eq, getTableColumns, inArray } from 'drizzle-orm'

import {
  EvaluationTemplate,
  EvaluationTemplateWithCategory,
} from '../schema/types'
import { database } from '../client'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '../lib/Result'

export async function findAllEvaluationTemplates(): Promise<
  TypedResult<EvaluationTemplateWithCategory[], Error>
> {
  const result = await database
    .select({
      ...getTableColumns(evaluationAdvancedTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationAdvancedTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(
        evaluationAdvancedTemplates.categoryId,
        evaluationTemplateCategories.id,
      ),
    )
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationAdvancedTemplates.name),
    )
  return Result.ok(result)
}

export async function findEvaluationTemplateById(
  id: number,
  db = database,
): Promise<TypedResult<EvaluationTemplate, Error>> {
  const result = await db
    .select()
    .from(evaluationAdvancedTemplates)
    .where(eq(evaluationAdvancedTemplates.id, id))
    .limit(1)
    .then((rows) => rows[0])

  if (!result) {
    return Result.error(new NotFoundError('Evaluation template not found'))
  }

  return Result.ok(result)
}

export async function filterEvaluationTemplatesById(
  ids: number[],
): Promise<TypedResult<EvaluationTemplateWithCategory[], Error>> {
  const result = await database
    .select({
      ...getTableColumns(evaluationAdvancedTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationAdvancedTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(
        evaluationAdvancedTemplates.categoryId,
        evaluationTemplateCategories.id,
      ),
    )
    .where(inArray(evaluationAdvancedTemplates.id, ids))
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationAdvancedTemplates.name),
    )

  return Result.ok(result)
}
