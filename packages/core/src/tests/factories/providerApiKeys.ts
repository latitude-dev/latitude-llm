import { faker } from '@faker-js/faker'

import { Providers, User, Workspace } from '../../browser'
import {
  createProviderApiKey as createFn,
  destroyProviderApiKey,
} from '../../services/providerApiKeys'

export function defaultProviderFakeData() {
  return { type: Providers.OpenAI, name: faker.internet.domainName() }
}

export type ICreateProvider = {
  workspace: Workspace
  type: Providers
  name: string
  user: User
  deletedAt?: Date
  token?: string
}
export async function createProviderApiKey({
  workspace,
  type,
  name,
  user,
  deletedAt,
  token = `sk-${faker.string.alphanumeric(48)}`,
}: ICreateProvider) {
  let providerApiKey = await createFn({
    workspace,
    provider: type,
    name,
    token,
    author: user,
  }).then((r) => r.unwrap())

  if (deletedAt) {
    providerApiKey = await destroyProviderApiKey(providerApiKey).then((r) =>
      r.unwrap(),
    )
  }

  return providerApiKey
}
