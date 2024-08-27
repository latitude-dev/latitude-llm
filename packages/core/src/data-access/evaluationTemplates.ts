import { eq } from 'drizzle-orm'

import { EvaluationTemplate } from '../browser'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'
import { evaluationTemplates } from '../schema'

export async function findAllEvaluationTemplates(): Promise<
  TypedResult<EvaluationTemplate[], Error>
> {
  const result = await database.query.evaluationTemplates.findMany()
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
