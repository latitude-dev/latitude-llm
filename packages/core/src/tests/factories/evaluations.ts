import { faker } from '@faker-js/faker'

import { ProviderApiKey } from '../../browser'
import { findWorkspaceFromProviderApiKey } from '../../data-access'
import { createEvaluation as createEvaluationService } from '../../services'
import { helpers } from './helpers'
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
  const prompt = helpers.createPrompt({ provider })

  const evaluationResult = await createEvaluationService({
    workspace,
    prompt,
    name: name ?? faker.company.catchPhrase(),
    description: description ?? faker.lorem.sentence(),
  })

  return evaluationResult.unwrap()
}
