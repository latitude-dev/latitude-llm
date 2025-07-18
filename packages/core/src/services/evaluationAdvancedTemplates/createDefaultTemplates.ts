import { evaluationAdvancedTemplates } from '../../assets/evaluationAdvancedTemplates'
import { EvaluationResultableType } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { createEvaluationTemplate } from './create'

export async function createDefaultEvaluationTemplates(
  transaction = new Transaction(),
) {
  const mapTypes = {
    boolean: EvaluationResultableType.Boolean,
    number: EvaluationResultableType.Number,
    text: EvaluationResultableType.Text,
  }

  const promises = evaluationAdvancedTemplates.map((template) => {
    const type = mapTypes[
      template.type as keyof typeof mapTypes
    ] as EvaluationResultableType
    const detail =
      type === EvaluationResultableType.Number
        ? { range: { from: 1, to: 5 } }
        : undefined

    return createEvaluationTemplate(
      {
        name: template.title,
        description: template.description,
        categoryId: 1,
        categoryName: 'Latitude',
        configuration: {
          type,
          detail,
        },
        prompt: template.template,
      },
      transaction,
    )
  })

  const results = await Promise.all(promises)
  const errorResult = Result.findError(results)
  if (errorResult) return errorResult

  return Result.ok(results.map((result) => result.value))
}
