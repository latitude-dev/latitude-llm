import { Providers, Workspace } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { User } from 'lucia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createProviderApiKeyAction } from './create'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    providerApiKeyPresenter: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('$/presenters/providerApiKeyPresenter', () => ({
  default: mocks.providerApiKeyPresenter,
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
      const mockPresentedApiKey = {
        id: 'presented-id',
        name: 'Presented Test API Key',
      }
      mocks.providerApiKeyPresenter.mockReturnValue(mockPresentedApiKey)

      const [data, error] = await createProviderApiKeyAction({
        provider: Providers.OpenAI,
        token: 'test-token',
        name: 'Test API Key',
      })

      expect(error).toBeNull()
      expect(data).toEqual(mockPresentedApiKey)
      expect(mocks.providerApiKeyPresenter).toHaveBeenCalled()
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
        // @ts-expect-error - Testing invalid input
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
  })
})
