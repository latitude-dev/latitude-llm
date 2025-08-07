import { asc, eq, getTableColumns, inArray } from 'drizzle-orm'

import { NotFoundError } from '@latitude-data/constants/errors'
import { EvaluationTemplate, EvaluationTemplateWithCategory } from '../browser'
import { database } from '../client'
import { Result, TypedResult } from '../lib/Result'
import {
  evaluationAdvancedTemplates,
  evaluationTemplateCategories,
} from '../schema'

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
  const result = await db.query.evaluationAdvancedTemplates.findFirst({
    where: eq(evaluationAdvancedTemplates.id, id),
  })

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
