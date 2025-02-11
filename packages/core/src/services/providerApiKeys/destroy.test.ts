import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import {
  ProviderApiKeysRepository,
  WorkspacesRepository,
} from '../../repositories'
import { providerApiKeys } from '../../schema'
import {
  createProject,
  createProviderApiKey,
  setProviderAsDefault,
} from '../../tests/factories'
import { destroyProviderApiKey } from './destroy'

// Mock environment variable
vi.mock('@latitude-data/env', () => ({
  env: {
    DEFAULT_PROVIDER_API_KEY: 'latitude-api-key',
  },
}))

describe('destroyProviderApiKey', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject()
    workspace = w
    user = u
  })

  it('deletes a non-default provider', async () => {
    const defaultProvider = await createProviderApiKey({
      workspace,
      user,
      name: 'Default',
      type: Providers.OpenAI,
      token: 'fake-default-api-key',
    })
    await setProviderAsDefault(workspace, defaultProvider)

    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'Provider',
      type: Providers.OpenAI,
      token: 'fake-api-key',
    })

    const result = await destroyProviderApiKey(provider)

    expect(result.ok).toBe(true)

    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    expect(workspace.defaultProviderId).toBe(defaultProvider.id)

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).not.toContain(provider.id)

    const removedProvidedData = await database.query.providerApiKeys.findFirst({
      where: eq(providerApiKeys.id, provider.id),
    })

    expect(removedProvidedData).toBeDefined()
    expect(removedProvidedData?.token).not.toBe(provider.token)
  })

  it('deletes the default provider', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'Provider',
      type: Providers.OpenAI,
      token: 'fake-api-key',
    })
    await setProviderAsDefault(workspace, provider)

    const result = await destroyProviderApiKey(provider)

    expect(result.ok).toBe(true)

    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    expect(workspace.defaultProviderId).toBeNull()

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).not.toContain(provider.id)

    const removedProvidedData = await database.query.providerApiKeys.findFirst({
      where: eq(providerApiKeys.id, provider.id),
    })

    expect(removedProvidedData).toBeDefined()
    expect(removedProvidedData?.token).not.toBe(provider.token)
  })
})
