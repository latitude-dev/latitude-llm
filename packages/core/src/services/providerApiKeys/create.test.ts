import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers, User, Workspace } from '../../browser'
import { BadRequestError } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { createProject } from '../../tests/factories'
import { createProviderApiKey } from './create'
import { destroyProviderApiKey } from './destroy'

const mocks = await vi.hoisted(async () => ({
  publisher: vi.spyOn(
    await import('../../events/publisher').then((f) => f.publisher),
    'publishLater',
  ),
}))

describe('createProviderApiKey', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({ providers: [] })
    workspace = w
    user = u

    mocks.publisher.mockClear()
  })

  it('creates a provider', async () => {
    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      author: user,
    })

    expect(result.ok).toEqual(true)

    const provider = result.unwrap()

    expect(provider.provider).toEqual(Providers.OpenAI)
    expect(provider.name).toEqual('Provider')
    expect(provider.token).toEqual('fake-token')
    expect(provider.defaultModel).toEqual(null)

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([provider.id])

    expect(mocks.publisher).toHaveBeenCalledOnce()
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'providerApiKeyCreated',
      data: {
        providerApiKey: provider,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  })

  it('creates a provider with default model', async () => {
    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      defaultModel: 'gpt-4o',
      author: user,
    })

    expect(result.ok).toEqual(true)

    const provider = result.unwrap()

    expect(provider.provider).toEqual(Providers.OpenAI)
    expect(provider.name).toEqual('Provider')
    expect(provider.token).toEqual('fake-token')
    expect(provider.defaultModel).toEqual('gpt-4o')

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([provider.id])

    expect(mocks.publisher).toHaveBeenCalledOnce()
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'providerApiKeyCreated',
      data: {
        providerApiKey: provider,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  })

  it('does not allow to create a provider with empty default model', async () => {
    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      defaultModel: '',
      author: user,
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual('Default model cannot be empty')

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([])

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('creates a custom provider with URL', async () => {
    const result = await createProviderApiKey({
      workspace,
      provider: Providers.Custom,
      token: 'fake-token',
      name: 'Provider',
      url: 'https://example.com',
      defaultModel: 'llama3.2-8b',
      author: user,
    })

    expect(result.ok).toEqual(true)

    const provider = result.unwrap()

    expect(provider.provider).toEqual(Providers.Custom)
    expect(provider.name).toEqual('Provider')
    expect(provider.token).toEqual('fake-token')
    expect(provider.url).toEqual('https://example.com')
    expect(provider.defaultModel).toEqual('llama3.2-8b')

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([provider.id])

    expect(mocks.publisher).toHaveBeenCalledOnce()
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'providerApiKeyCreated',
      data: {
        providerApiKey: provider,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  })

  it('does not allow to create a custom provider without URL', async () => {
    const result = await createProviderApiKey({
      workspace,
      provider: Providers.Custom,
      token: 'fake-token',
      name: 'Provider',
      defaultModel: 'llama3.2-8b',
      author: user,
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual('Custom provider requires a URL')

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([])

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('creates a provider with same name if one is deleted', async () => {
    const oldProvider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      author: user,
    }).then((r) => r.unwrap())
    await destroyProviderApiKey(oldProvider)

    mocks.publisher.mockClear()

    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      author: user,
    })

    expect(result.ok).toEqual(true)

    const provider = result.unwrap()

    expect(provider.provider).toEqual(Providers.OpenAI)
    expect(provider.name).toEqual('Provider')
    expect(provider.token).toEqual('fake-token')
    expect(provider.defaultModel).toEqual(null)

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([provider.id])

    expect(mocks.publisher).toHaveBeenCalledOnce()
    expect(mocks.publisher).toHaveBeenCalledWith({
      type: 'providerApiKeyCreated',
      data: {
        providerApiKey: provider,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })
  })

  it('does not allow to create a provider with duplicate name', async () => {
    const oldProvider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      author: user,
    }).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider',
      author: user,
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual(
      'A provider API key with this name already exists',
    )

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([oldProvider.id])

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('does not allow to create a provider with duplicate token', async () => {
    const oldProvider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider 1',
      author: user,
    }).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    const result = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Provider 2',
      author: user,
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual('This token is already in use')

    const providersScope = new ProviderApiKeysRepository(workspace.id)
    const providers = await providersScope.findAll().then((r) => r.unwrap())

    expect(providers.map((p) => p.id)).toEqual([oldProvider.id])

    expect(mocks.publisher).not.toHaveBeenCalled()
  })
})
