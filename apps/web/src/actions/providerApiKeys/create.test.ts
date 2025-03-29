import { Workspace } from '@latitude-data/core'
import * as factories from '@latitude-data/core/tests/factories'
import { User } from 'lucia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createProviderApiKeyAction } from './create'
import { Providers } from '@latitude-data/constants'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('createProviderApiKeyAction', () => {
  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        url: 'https://api.openai.com',
        name: 'Test API Key',
      })

      expect(error!.name).toEqual('UnauthorizedError')
    })
  })

  describe('authorized', () => {
    let workspace: Workspace
    let user: User

    beforeEach(async () => {
      const { userData, workspace: w } = await factories.createWorkspace()

      user = userData
      workspace = w

      mocks.getSession.mockReturnValue({
        user: userData,
        workspace,
      })
    })

    it('successfully creates a provider API key', async () => {
      const [result, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
      })

      expect(error).toBeNull()

      const provider = result!

      expect(provider.provider).toEqual(Providers.OpenAI)
      expect(provider.name).toEqual('Test API Key')
      expect(provider.token).toEqual('tes********oken')
      expect(provider.defaultModel).toEqual(null)
    })

    it('successfully creates a provider API key with a default model', async () => {
      const [result, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
        defaultModel: 'gpt-4o',
      })

      expect(error).toBeNull()

      const provider = result!

      expect(provider.provider).toEqual(Providers.OpenAI)
      expect(provider.name).toEqual('Test API Key')
      expect(provider.token).toEqual('tes********oken')
      expect(provider.defaultModel).toEqual('gpt-4o')
    })

    it('handles errors when creating a provider API key fails', async () => {
      const [data, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        // @ts-expect-error - Testing invalid input
        token: null,
        name: 'Test API Key',
      })

      expect(data).toBeNull()
      expect(error).toBeDefined()
    })

    it('fails creating a custom provider without url', async () => {
      const [data, error] = await createProviderApiKeyAction({
        provider: Providers.Custom,
        token: 'test-token',
        name: 'Test API Key',
      })

      expect(data).toBeNull()
      expect(error).toBeDefined()
    })

    it('returns proper error when duplicate name', async () => {
      await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'foo',
        // @ts-expect-error - Mock
        user,
      })

      const [data, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'foo',
        url: 'https://api.openai.com',
      })

      expect(data).toBeNull()
      expect(error).toBeDefined()
    })

    it('allows creating two providers with same name if one is deleted', async () => {
      await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'foo',
        // @ts-expect-error - Mock
        user,
        deletedAt: new Date(),
      })

      const [_, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'foo',
        url: 'https://api.openai.com',
      })

      expect(error).toBeNull()
    })
  })
})
