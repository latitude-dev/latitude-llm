import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Providers, User, Workspace } from '../../browser'
import { database } from '../../client'
import { BadRequestError } from '../../lib/errors'
import {
  ProviderApiKeysRepository,
  WorkspacesRepository,
} from '../../repositories'
import { providerApiKeys } from '../../schema'
import * as factories from '../../tests/factories'
import { destroyProviderApiKey } from './destroy'

describe('destroyProviderApiKey', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await factories.createProject({
      documents: { prompt: 'prompt' },
    })
    workspace = w
    user = u
  })

  it('fails when deleting the default latitude provider', async () => {
    const provider = await factories.createProviderApiKey({
      workspace: workspace,
      user: user,
      name: 'Latitude',
      type: Providers.OpenAI,
      token: env.DEFAULT_PROVIDER_API_KEY,
    })

    await expect(
      destroyProviderApiKey(provider).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Cannot delete the default provider API key'),
    )

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())
    expect(providers.map((p) => p.id)).toContain(provider.id)
  })

  it('succeeds when deleting a non-default provider', async () => {
    const defaultProvider = await factories.createProviderApiKey({
      workspace,
      user,
      name: 'Default',
      type: Providers.OpenAI,
      token: 'fake-default-api-key',
    })
    await factories.setProviderAsDefault(workspace, defaultProvider)

    const provider = await factories.createProviderApiKey({
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

  it('succeeds when deleting the default provider', async () => {
    const provider = await factories.createProviderApiKey({
      workspace,
      user,
      name: 'Provider',
      type: Providers.OpenAI,
      token: 'fake-api-key',
    })
    await factories.setProviderAsDefault(workspace, provider)

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
