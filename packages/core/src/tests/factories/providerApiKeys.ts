import { faker } from '@faker-js/faker'

import { Providers, User, Workspace } from '../../browser'
import { createProviderApiKey as createFn } from '../../services/providerApiKeys'

export function defaultProviderFakeData() {
  return { type: Providers.OpenAI, name: faker.internet.domainName() }
}

export type ICreateProvider = {
  workspace: Workspace
  type: Providers
  name: string
  user: User
}
export async function createProviderApiKey({
  workspace,
  type,
  name,
  user,
}: ICreateProvider) {
  const providerApiKey = await createFn({
    workspace,
    provider: type,
    name,
    token: `sk-${faker.string.alphanumeric(48)}`,
    author: user,
  }).then((r) => r.unwrap())

  return providerApiKey
}
