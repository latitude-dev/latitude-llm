import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { User, Workspace } from '../../schema/types'
import { WorkspacesRepository } from '../../repositories'
import {
  createProject,
  createProviderApiKey,
  setProviderAsDefault,
} from '../../tests/factories'
import {
  findDefaultEvaluationProvider,
  findDefaultProvider,
} from './findDefaultProvider'

vi.mock('@latitude-data/env', () => ({
  env: {
    DEFAULT_PROVIDER_API_KEY: 'latitude-api-key',
  },
}))

describe('findDefaultProvider', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({ providers: [] })
    workspace = w
    user = u
  })

  it('returns default provider when default provider is set', async () => {
    await createProviderApiKey({
      workspace,
      user,
      name: 'First Provider',
      type: Providers.OpenAI,
      token: 'fake-first-api-key',
    })
    const defaultProvider = await createProviderApiKey({
      workspace,
      user,
      name: 'Default Provider',
      type: Providers.OpenAI,
      token: 'fake-default-api-key',
    })
    await setProviderAsDefault(workspace, defaultProvider)
    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    const result = await findDefaultProvider(workspace)

    expect(result.ok).toBe(true)

    const provider = result.unwrap()!

    expect(provider.id).toBe(defaultProvider.id)
  })

  it('returns first provider when default provider is not set', async () => {
    const firstProvider = await createProviderApiKey({
      workspace,
      user,
      name: 'First Provider',
      type: Providers.OpenAI,
      token: 'fake-first-api-key',
    })

    const result = await findDefaultProvider(workspace)

    expect(result.ok).toBe(true)

    const provider = result.unwrap()!

    expect(provider.id).toBe(firstProvider.id)
  })
})

describe('findDefaultEvaluationProvider', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({ providers: [] })
    workspace = w
    user = u
  })

  it('returns provider when there is a compatible provider', async () => {
    await createProviderApiKey({
      workspace,
      user,
      name: 'Incompatible Provider',
      type: Providers.Groq,
      token: 'fake-incompatible-api-key',
    })
    await createProviderApiKey({
      workspace,
      user,
      name: 'Compatible Provider',
      type: Providers.OpenAI,
      token: 'fake-compatible-api-key',
    })
    const defaultProvider = await createProviderApiKey({
      workspace,
      user,
      name: 'Default Provider',
      type: Providers.OpenAI,
      token: 'fake-default-api-key',
    })
    await setProviderAsDefault(workspace, defaultProvider)
    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    const result = await findDefaultEvaluationProvider(workspace)

    expect(result.ok).toBe(true)

    const provider = result.unwrap()!

    expect(provider.id).toBe(defaultProvider.id)
  })

  it('returns no provider when there is no compatible provider', async () => {
    await createProviderApiKey({
      workspace,
      user,
      name: 'Incompatible Provider',
      type: Providers.Groq,
      token: 'fake-incompatible-api-key',
    })
    const defaultProvider = await createProviderApiKey({
      workspace,
      user,
      name: 'Default Provider',
      type: Providers.Groq,
      token: 'fake-default-api-key',
    })
    await setProviderAsDefault(workspace, defaultProvider)
    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    const result = await findDefaultEvaluationProvider(workspace)

    expect(result.ok).toBe(true)

    const provider = result.unwrap()

    expect(provider).toBeUndefined()
  })
})
