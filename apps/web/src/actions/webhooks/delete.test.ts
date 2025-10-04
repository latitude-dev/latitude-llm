import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteWebhookAction } from './delete'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    publisher: {
      publishLater: vi.fn(),
    },
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@latitude-data/core/events/publisher', () => ({
  publisher: {
    publishLater: mocks.publisher.publishLater,
  },
}))

describe('deleteWebhookAction', () => {
  let webhook: any
  let workspace: any
  let user: any

  beforeEach(async () => {
    const { workspace: ws, userData } = await factories.createWorkspace()
    workspace = ws
    user = userData
    webhook = await factories.createWebhook({
      name: 'Test Webhook',
      url: 'https://example.com/webhook',
      isActive: true,
      workspaceId: workspace.id,
    })

    mocks.getSession.mockResolvedValue({
      user: workspace.user,
      session: {
        currentWorkspaceId: workspace.id,
      },
    })

    // Reset publisher mock before each test
    mocks.publisher.publishLater.mockReset()
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)

      const [_, error] = await deleteWebhookAction({
        id: webhook.id,
      })

      expect(error!.name).toEqual('UnauthorizedError')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('successfully deletes a webhook', async () => {
      const [data, error] = await deleteWebhookAction({
        id: webhook.id,
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.id).toEqual(webhook.id)
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('returns error when webhook is not found', async () => {
      const [_, error] = await deleteWebhookAction({
        id: 999999,
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('NotFoundError')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })
  })
})
