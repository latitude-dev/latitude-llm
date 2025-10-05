import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateWebhookAction } from './update'

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

describe('updateWebhookAction', () => {
  let webhook: any
  let workspace: any
  let user: any

  beforeEach(async () => {
    const { workspace: ws, userData } = await factories.createWorkspace()
    user = userData
    workspace = ws
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

      const [_, error] = await updateWebhookAction({
        id: webhook.id,
        name: 'Updated Webhook',
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

    it('successfully updates a webhook name', async () => {
      const [data, error] = await updateWebhookAction({
        id: webhook.id,
        name: 'Updated Webhook',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.name).toEqual('Updated Webhook')
      expect(data!.url).toEqual(webhook.url)
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('successfully updates a webhook URL', async () => {
      const [data, error] = await updateWebhookAction({
        id: webhook.id,
        url: 'https://new-example.com/webhook',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.url).toEqual('https://new-example.com/webhook')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('successfully updates project IDs', async () => {
      const [data, error] = await updateWebhookAction({
        id: webhook.id,
        projectIds: JSON.stringify([1, 2, 3]),
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.projectIds).toEqual([1, 2, 3])
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('successfully updates active status', async () => {
      const [data, error] = await updateWebhookAction({
        id: webhook.id,
        isActive: 'false',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.isActive).toBe(false)
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects invalid project IDs format', async () => {
      const [_, error] = await updateWebhookAction({
        id: webhook.id,
        projectIds: 'invalid-json',
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('BadRequestError')
      expect(error!.message).toContain('Invalid project IDs')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects invalid URL format', async () => {
      const [_, error] = await updateWebhookAction({
        id: webhook.id,
        url: 'not-a-url',
      })

      expect(error).toBeDefined()
      expect(error!.message).toContain('Invalid URL format')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects empty name', async () => {
      const [_, error] = await updateWebhookAction({
        id: webhook.id,
        name: '',
      })

      expect(error).toBeDefined()
      expect(error!.message).toContain('Name is required')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('returns error when webhook is not found', async () => {
      const [_, error] = await updateWebhookAction({
        id: -1,
        name: 'Updated Webhook',
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('NotFoundError')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })
  })
})
