import { faker } from '@faker-js/faker'

import { type Workspace } from '../../schema/models/types/Workspace'
import { createApiKey as createApiKeyFn } from '../../services/apiKeys/create'

export type ICreateApiKey = {
  workspace: Workspace
  name?: string
  token?: string
}

export async function createApiKey({
  workspace,
  name = faker.company.name(),
}: ICreateApiKey) {
  const result = await createApiKeyFn({
    name,
    workspace,
  })

  return { apiKey: result.unwrap() }
}
