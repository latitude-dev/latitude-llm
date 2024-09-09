import { asc, eq, getTableColumns, inArray } from 'drizzle-orm'

import { EvaluationTemplate } from '../browser'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'
import { evaluationTemplateCategories, evaluationTemplates } from '../schema'

export type EvaluationTemplateWithCategory = EvaluationTemplate & {
  category: string
}

export async function findAllEvaluationTemplates(): Promise<
  TypedResult<EvaluationTemplateWithCategory[], Error>
> {
  const result = await database
    .select({
      ...getTableColumns(evaluationTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(evaluationTemplates.categoryId, evaluationTemplateCategories.id),
    )
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationTemplates.name),
    )
  return Result.ok(result)
}

export async function findEvaluationTemplateById(
  id: number,
): Promise<TypedResult<EvaluationTemplate, Error>> {
  const result = await database.query.evaluationTemplates.findFirst({
    where: eq(evaluationTemplates.id, id),
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
      ...getTableColumns(evaluationTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(evaluationTemplates.categoryId, evaluationTemplateCategories.id),
    )
    .where(inArray(evaluationTemplates.id, ids))
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationTemplates.name),
    )

  return Result.ok(result)
}
