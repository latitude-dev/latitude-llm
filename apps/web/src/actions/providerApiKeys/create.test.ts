import * as factories from '@latitude-data/core/factories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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
      mocks.getSession.mockResolvedValue(null)

      const { serverError } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        url: 'https://api.openai.com',
        name: 'Test API Key',
      })

      expect(serverError).toEqual('Unauthorized')
    })
  })

  describe('authorized', () => {
    let workspace: Workspace
    let user: User

    beforeEach(async () => {
      const { userData, workspace: w } = await factories.createWorkspace()

      user = userData
      workspace = w

      mocks.getSession.mockResolvedValue({
        user: userData,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('successfully creates a provider API key', async () => {
      const {
        data: provider,
        serverError,
        validationErrors,
      } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
        configuration: { endpoint: 'chat_completions' },
      })

      expect(serverError).toBeUndefined()
      expect(validationErrors).toBeUndefined()
      expect(provider.provider).toEqual(Providers.OpenAI)
      expect(provider.name).toEqual('Test API Key')
      expect(provider.token).toEqual('tes********oken')
      expect(provider.defaultModel).toEqual(null)
      expect(provider.configuration).toEqual({
        endpoint: 'chat_completions',
      })
    })

    it('successfully creates an OpenAI provider for responses endpoint', async () => {
      const { data } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
        configuration: { endpoint: 'responses' },
      })

      expect(data!.configuration).toEqual({
        endpoint: 'responses',
      })
    })

    it('successfully creates a provider API key with a default model', async () => {
      const {
        data: provider,
        serverError,
        validationErrors,
      } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
        defaultModel: 'gpt-4o',
        configuration: { endpoint: 'chat_completions' },
      })

      expect(serverError).toBeUndefined()
      expect(validationErrors).toBeUndefined()
      expect(provider?.provider).toEqual(Providers.OpenAI)
      expect(provider?.name).toEqual('Test API Key')
      expect(provider?.token).toEqual('tes********oken')
      expect(provider?.defaultModel).toEqual('gpt-4o')
    })

    it('handles errors when creating a provider API key fails', async () => {
      const { data, validationErrors } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        // @ts-expect-error - testing invalid input
        token: null,
        name: 'Test API Key',
      })

      expect(data).toBeUndefined()
      expect(validationErrors?.fieldErrors?.token).toContain(
        'Invalid input: expected string, received null',
      )
    })

    it('fails creating a custom provider without url', async () => {
      const { data, serverError } = await createProviderApiKeyAction({
        provider: Providers.Custom,
        token: 'test-token',
        name: 'Test API Key',
      })

      expect(data).toBeUndefined()
      expect(serverError).toEqual('Custom provider requires a URL')
    })

    it('returns proper error when duplicate name', async () => {
      await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'foo',
        // @ts-expect-error - testing
        user,
        configuration: { endpoint: 'chat_completions' },
      })

      const { data, validationErrors } = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'foo',
        url: 'https://api.openai.com',
      })

      expect(data).toBeUndefined()
      expect(validationErrors?.fieldErrors.configuration).toContain(
        'Invalid input: expected object, received undefined',
      )
    })

    it('allows creating two providers with same name if one is deleted', async () => {
      await factories.createProviderApiKey({
        workspace,
        type: Providers.OpenAI,
        name: 'foo',
        // @ts-expect-error - testing
        user,
        deletedAt: new Date(),
        configuration: { endpoint: 'chat_completions' },
      })

      const { serverError, validationErrors } =
        await createProviderApiKeyAction({
          provider: Providers.OpenAI,
          token: 'test-token',
          name: 'foo',
          url: 'https://api.openai.com',
          configuration: { endpoint: 'chat_completions' },
        })

      expect(serverError).toBeUndefined()
      expect(validationErrors).toBeUndefined()
    })
  })
})
