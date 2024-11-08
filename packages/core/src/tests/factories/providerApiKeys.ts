import { faker } from '@faker-js/faker'

import { ProviderApiKey, Providers, User, Workspace } from '../../browser'
import {
  createProviderApiKey as createFn,
  destroyProviderApiKey,
} from '../../services/providerApiKeys'
import { updateWorkspace } from '../../services/workspaces'

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
  url?: string
  defaultModel?: string
}
export async function createProviderApiKey({
  workspace,
  type,
  name,
  user,
  deletedAt,
  token = `sk-${faker.string.alphanumeric(48)}`,
  defaultModel,
  url,
}: ICreateProvider) {
  let providerApiKey = await createFn({
    workspace,
    provider: type,
    name,
    token,
    author: user,
    defaultModel,
    url,
  }).then((r) => r.unwrap())

  if (deletedAt) {
    providerApiKey = await destroyProviderApiKey(providerApiKey).then((r) =>
      r.unwrap(),
    )
  }

  return providerApiKey
}

export async function setProviderAsDefault(
  workspace: Workspace,
  provider: ProviderApiKey,
) {
  await updateWorkspace(workspace, { defaultProviderId: provider.id })
}
