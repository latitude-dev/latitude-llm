import { evaluationAdvancedTemplates } from '../../assets/evaluationAdvancedTemplates'
import { database } from '../../client'
import { EvaluationResultableType } from '../../constants'
import { Result, Transaction } from '../../lib'
import { createEvaluationTemplate } from './create'

export function createDefaultEvaluationTemplates(db = database) {
  const mapTypes = {
    boolean: EvaluationResultableType.Boolean,
    number: EvaluationResultableType.Number,
    text: EvaluationResultableType.Text,
  }

  Transaction.call(async (tx) => {
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
        tx,
      )
    })

    const results = await Promise.all(promises)
    const errorResult = Result.findError(results)
    if (errorResult) return errorResult

    return Result.ok(results.map((result) => result.value))
  }, db)
}
