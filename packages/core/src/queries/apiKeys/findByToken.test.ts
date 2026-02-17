import { randomUUID } from 'crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { type Workspace } from '../../schema/models/types/Workspace'
import { NotFoundError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { findApiKeyByToken } from './findByToken'

describe('findApiKeyByToken', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace
  })

  it('returns the API key when found', async () => {
    const { apiKey } = await factories.createApiKey({ workspace })

    const result = await findApiKeyByToken({
      workspaceId: workspace.id,
      token: apiKey.token,
    })

    expect(result).toEqual(
      expect.objectContaining({
        id: apiKey.id,
        token: apiKey.token,
        workspaceId: workspace.id,
      }),
    )
  })

  it('throws NotFoundError when the API key is not found', async () => {
    await expect(
      findApiKeyByToken({
        workspaceId: workspace.id,
        token: randomUUID(),
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('only returns API keys for the current workspace', async () => {
    const { workspace: otherWorkspace } = await factories.createWorkspace()
    const { apiKey: otherApiKey } = await factories.createApiKey({
      workspace: otherWorkspace,
    })

    await expect(
      findApiKeyByToken({
        workspaceId: workspace.id,
        token: otherApiKey.token,
      }),
    ).rejects.toThrow(NotFoundError)
  })
})
