import { beforeEach, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { findAllProviderApiKeys } from '../../queries/providerApiKeys/findAll'
import { createProject } from '../../tests/factories'
import { createProviderApiKey } from './create'
import { updateProviderApiKeyName } from './updateName'
import { BadRequestError } from './../../lib/errors'

describe('updateProviderApiKeyName', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({ providers: [] })
    workspace = w
    user = u
  })

  it('updates provider API key name successfully', async () => {
    const provider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Original Name',
      author: user,
    }).then((r) => r.unwrap())

    const result = await updateProviderApiKeyName({
      providerApiKey: provider,
      workspaceId: workspace.id,
      name: 'Updated Name',
    })

    expect(result.ok).toEqual(true)

    const updatedProvider = result.unwrap()

    expect(updatedProvider.id).toEqual(provider.id)
    expect(updatedProvider.name).toEqual('Updated Name')
    expect(updatedProvider.provider).toEqual(provider.provider)
    expect(updatedProvider.token).toEqual(provider.token)

    const providers = await findAllProviderApiKeys({ workspaceId: workspace.id })

    expect(providers).toHaveLength(1)
    expect(providers[0]!.name).toEqual('Updated Name')
  })

  it('does not allow empty name', async () => {
    const provider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Original Name',
      author: user,
    }).then((r) => r.unwrap())

    const result = await updateProviderApiKeyName({
      providerApiKey: provider,
      workspaceId: workspace.id,
      name: '',
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual(
      'Name must be at least 1 characters long',
    )

    const providers = await findAllProviderApiKeys({ workspaceId: workspace.id })

    expect(providers).toHaveLength(1)
    expect(providers[0]!.name).toEqual('Original Name')
  })

  it('trims whitespace from name', async () => {
    const provider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Original Name',
      author: user,
    }).then((r) => r.unwrap())

    const result = await updateProviderApiKeyName({
      providerApiKey: provider,
      workspaceId: workspace.id,
      name: '  Updated Name  ',
    })

    expect(result.ok).toEqual(true)

    const updatedProvider = result.unwrap()

    expect(updatedProvider.id).toEqual(provider.id)
    expect(updatedProvider.name).toEqual('Updated Name')

    const providers = await findAllProviderApiKeys({ workspaceId: workspace.id })

    expect(providers).toHaveLength(1)
    expect(providers[0]!.name).toEqual('Updated Name')
  })

  it('does not allow name with only whitespace', async () => {
    const provider = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      token: 'fake-token',
      name: 'Original Name',
      author: user,
    }).then((r) => r.unwrap())

    const result = await updateProviderApiKeyName({
      providerApiKey: provider,
      workspaceId: workspace.id,
      name: '   ',
    })

    expect(result.ok).toEqual(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toEqual(
      'Name must be at least 1 characters long',
    )

    const providers = await findAllProviderApiKeys({ workspaceId: workspace.id })

    expect(providers).toHaveLength(1)
    expect(providers[0]!.name).toEqual('Original Name')
  })
})

// TODO - Add the action with the updateName function, then update the UI to add this possibility
