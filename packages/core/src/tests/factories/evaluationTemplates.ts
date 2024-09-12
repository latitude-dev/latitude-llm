import { faker } from '@faker-js/faker'

import { EvaluationResultableType } from '../../constants'
import { createEvaluationTemplate as createEvaluationTemplateService } from '../../services/evaluationTemplates/create'

export type IEvaluationTemplateData = {
  name?: string
  description?: string
  prompt?: string
  categoryId?: number
  categoryName?: string
}

export async function createEvaluationTemplate({
  name,
  description,
  categoryId,
  categoryName,
  prompt = faker.lorem.paragraph(),
}: IEvaluationTemplateData) {
  const evaluationTemplateResult = await createEvaluationTemplateService({
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
    categoryId,
    categoryName: categoryName ?? faker.lorem.word(),
    prompt,
    configuration: {
      type: EvaluationResultableType.Text,
    },
  })

  return evaluationTemplateResult.unwrap()
}
