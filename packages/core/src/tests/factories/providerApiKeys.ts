import { faker } from '@faker-js/faker'

import { Providers, SafeUser, Workspace } from '../../browser'
import { createProviderApiKey as createFn } from '../../services/providerApiKeys'

export type ICreateProvider = {
  workspace: Workspace
  type: Providers
  name: string
  user: SafeUser
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
    authorId: user.id,
  }).then((r) => r.unwrap())

  return providerApiKey
}
