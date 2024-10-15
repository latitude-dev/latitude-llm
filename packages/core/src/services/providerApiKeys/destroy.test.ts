import { env } from 'process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers, User, Workspace } from '../../browser'
import { BadRequestError } from '../../lib'
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

  it('should not allow deleting the default provider API key', async () => {
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

  it('should allow deleting a non-default provider API key', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'Non-Default Provider',
      type: Providers.OpenAI,
      token: 'non-default-api-key',
    })

    const result = await destroyProviderApiKey(provider)

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(provider)
  })
})
