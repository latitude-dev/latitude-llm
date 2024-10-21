import { env } from 'process'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import { BadRequestError } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { providerApiKeys } from '../../schema'
import { createProject, createProviderApiKey } from '../../tests/factories'
import { destroyProviderApiKey } from './destroy'

// Mock environment variable
vi.mock('@latitude-data/env', () => ({
  env: {
    DEFAULT_PROVIDER_API_KEY: 'default-api-key',
  },
}))

describe('destroyProviderApiKey', () => {
  let workspace: Workspace, user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject()
    workspace = w
    user = u
  })

  it('does not allow deleting the default provider API key', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'Default Provider',
      type: Providers.OpenAI,
      token: env.DEFAULT_PROVIDER_API_KEY,
    })

    const result = await destroyProviderApiKey(provider)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toBe(
      'Cannot delete the default provider API key',
    )
  })

  it('deletes a non-default provider API key', async () => {
    const secretToken = 'non-default-api-key'
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'Non-Default Provider',
      type: Providers.OpenAI,
      token: secretToken,
    })

    const result = await destroyProviderApiKey(provider)

    expect(result.ok).toBe(true)

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).not.toContain(provider.id)

    const removedProvidedData = await database.query.providerApiKeys.findFirst({
      where: eq(providerApiKeys.id, provider.id),
    })

    expect(removedProvidedData).toBeDefined()
    expect(removedProvidedData?.token).not.toBe(secretToken)
  })
})
