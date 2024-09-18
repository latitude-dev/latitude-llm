import { randomUUID } from 'crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { Workspace } from '../browser'
import { NotFoundError } from '../lib'
import * as factories from '../tests/factories'
import { ApiKeysRepository } from './apiKeysRepository'

describe('ApiKeysRepository', () => {
  let workspace: Workspace
  let apiKeysRepository: ApiKeysRepository

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace
    apiKeysRepository = new ApiKeysRepository(workspace.id)
  })

  describe('findByToken', () => {
    it('returns the API key when found', async () => {
      const { apiKey } = await factories.createApiKey({ workspace })

      const result = await apiKeysRepository.findByToken(apiKey.token)

      expect(result.ok).toBe(true)
      expect(result.unwrap()).toEqual(
        expect.objectContaining({
          id: apiKey.id,
          token: apiKey.token,
          workspaceId: workspace.id,
        }),
      )
    })

    it('returns a NotFoundError when the API key is not found', async () => {
      const result = await apiKeysRepository.findByToken(randomUUID())

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })

    it('only returns API keys for the current workspace', async () => {
      const { workspace: otherWorkspace } = await factories.createWorkspace()
      const { apiKey: otherApiKey } = await factories.createApiKey({
        workspace: otherWorkspace,
      })

      const result = await apiKeysRepository.findByToken(otherApiKey.token)

      expect(result.ok).toBe(false)
      expect(() => result.unwrap()).toThrowError(NotFoundError)
    })
  })
})
