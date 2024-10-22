import { asc, eq, getTableColumns, inArray } from 'drizzle-orm'

import { EvaluationTemplate, EvaluationTemplateWithCategory } from '../browser'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'
import {
  evaluationLegacyTemplates,
  evaluationTemplateCategories,
} from '../schema'

export async function findAllEvaluationTemplates(): Promise<
  TypedResult<EvaluationTemplateWithCategory[], Error>
> {
  const result = await database
    .select({
      ...getTableColumns(evaluationLegacyTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationLegacyTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(evaluationLegacyTemplates.categoryId, evaluationTemplateCategories.id),
    )
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationLegacyTemplates.name),
    )
  return Result.ok(result)
}

export async function findEvaluationTemplateById(
  id: number,
  db = database,
): Promise<TypedResult<EvaluationTemplate, Error>> {
  const result = await db.query.evaluationLegacyTemplates.findFirst({
    where: eq(evaluationLegacyTemplates.id, id),
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
      ...getTableColumns(evaluationLegacyTemplates),
      category: evaluationTemplateCategories.name,
    })
    .from(evaluationLegacyTemplates)
    .innerJoin(
      evaluationTemplateCategories,
      eq(evaluationLegacyTemplates.categoryId, evaluationTemplateCategories.id),
    )
    .where(inArray(evaluationLegacyTemplates.id, ids))
    .orderBy(
      asc(evaluationTemplateCategories.name),
      asc(evaluationLegacyTemplates.name),
    )

  return Result.ok(result)
}
