import { beforeEach, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { User, Workspace } from '../schema/types'
import { NotFoundError } from '../lib/errors'
import * as factories from '../tests/factories'
import { ProviderApiKeysRepository } from './providerApiKeysRepository'

describe('ProviderApiKeysRepository', () => {
  let workspace: Workspace
  let user: User
  let providerApiKeysRepository: ProviderApiKeysRepository

  beforeEach(async () => {
    const { workspace: createdWorkspace, user: createdUser } =
      await factories.createProject()
    workspace = createdWorkspace
    user = createdUser
    providerApiKeysRepository = new ProviderApiKeysRepository(workspace.id)
  })

  describe('findByName', () => {
    it('returns the provider API key when found', async () => {
      const providerApiKey = await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'test-provider',
      })

      const result = await providerApiKeysRepository.findByName('test-provider')

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual(
        expect.objectContaining({
          id: providerApiKey.id,
          name: providerApiKey.name,
          workspaceId: workspace.id,
        }),
      )
    })

    it('returns a NotFoundError when the provider API key is not found', async () => {
      const result = await providerApiKeysRepository.findByName('non-existent')

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })

    it('only returns provider API keys for the current workspace', async () => {
      const { workspace: otherWorkspace, user: otherUser } =
        await factories.createProject()
      await factories.createProviderApiKey({
        workspace: otherWorkspace,
        user: otherUser,
        type: Providers.OpenAI,
        name: 'other-provider',
      })

      const result =
        await providerApiKeysRepository.findByName('other-provider')

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })

  describe('findAllByNames', () => {
    it('returns provider API keys matching the given names', async () => {
      const key1 = await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'provider-1',
      })
      const key2 = await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'provider-2',
      })
      await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'provider-3',
      })

      const result = await providerApiKeysRepository.findAllByNames([
        'provider-1',
        'provider-2',
      ])

      expect(result.length).toBe(2)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: key1.id, name: 'provider-1' }),
          expect.objectContaining({ id: key2.id, name: 'provider-2' }),
        ]),
      )
    })

    it('only returns provider API keys for the current workspace', async () => {
      const { workspace: otherWorkspace, user: otherUser } =
        await factories.createProject()
      await factories.createProviderApiKey({
        workspace: otherWorkspace,
        user: otherUser,
        type: Providers.OpenAI,
        name: 'other-provider',
      })

      const result = await providerApiKeysRepository.findAllByNames([
        'other-provider',
      ])

      expect(result.length).toBe(0)
    })
  })

  describe('getUsage', () => {
    it('returns usage data for the provider', async () => {
      await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'test-provider',
      })

      const result = await providerApiKeysRepository.getUsage('test-provider')

      expect(result.ok).toBe(true)
      expect(Array.isArray(result.unwrap())).toBe(true)
    })

    it('returns empty array when no usage found', async () => {
      const result = await providerApiKeysRepository.getUsage('non-existent')

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual([])
    })
  })
})
