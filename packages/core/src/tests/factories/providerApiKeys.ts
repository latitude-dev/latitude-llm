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
  token?: string
}
export async function createProviderApiKey({
  workspace,
  type,
  name,
  user,
  token = `sk-${faker.string.alphanumeric(48)}`,
}: ICreateProvider) {
  const providerApiKey = await createFn({
    workspace,
    provider: type,
    name,
    token,
    author: user,
  }).then((r) => r.unwrap())

  return providerApiKey
}
