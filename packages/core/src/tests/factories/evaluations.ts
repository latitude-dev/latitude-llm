import { faker } from '@faker-js/faker'
import { ProviderApiKey } from '$core/browser'
import { findWorkspaceFromProviderApiKey } from '$core/data-access'
import { factories } from '$core/index'
import { createEvaluation as createEvaluationService } from '$core/services'

import { createProviderApiKey, ICreateProvider } from './providerApiKeys'

export type IEvaluationData = {
  provider: ICreateProvider | ProviderApiKey
  name?: string
  description?: string
}

export async function createEvaluation({
  provider: providerData,
  name,
  description,
}: IEvaluationData) {
  const provider =
    'id' in providerData
      ? providerData
      : await createProviderApiKey(providerData)

  const workspace = (await findWorkspaceFromProviderApiKey(provider))!
  const prompt = factories.helpers.createPrompt({ provider })

  const evaluationResult = await createEvaluationService({
    workspace,
    prompt,
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
  })

  return evaluationResult.unwrap()
}
