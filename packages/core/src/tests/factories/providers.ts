import { faker } from '@faker-js/faker'
import { Providers, SafeUser, Workspace } from '$core/browser'
import { createProviderApiKey } from '$core/services'

export type ICreateProvider = {
  workspace: Workspace
  type: Providers
  name: string
  user: SafeUser
}
export async function createProvider({
  workspace,
  type,
  name,
  user,
}: ICreateProvider) {
  const providerApiKey = await createProviderApiKey({
    workspace,
    provider: type,
    name,
    token: `sk-${faker.string.alphanumeric(48)}`,
    authorId: user.id,
  }).then((r) => r.unwrap())

  return providerApiKey
}
