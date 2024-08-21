import { EvaluationTemplate } from '$core/browser'
import { database } from '$core/client'
import { NotFoundError, Result, TypedResult } from '$core/lib'
import { evaluationTemplates } from '$core/schema'
import { eq } from 'drizzle-orm'

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
