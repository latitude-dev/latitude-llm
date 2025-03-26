import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWebhookAction } from './create'

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

describe('createWebhookAction', () => {
  let workspace: any
  let user: any

  beforeEach(async () => {
    const { workspace: ws, userData } = await factories.createWorkspace()
    workspace = ws
    user = userData

    mocks.getSession.mockReturnValue({
      user: workspace.user,
      workspace: { id: workspace.id, name: workspace.name },
    })

    // Reset publisher mock before each test
    mocks.publisher.publishLater.mockReset()
  })

  describe('unauthorized', () => {
    it('errors when the user is not authenticated', async () => {
      mocks.getSession.mockReturnValue(null)

      const [_, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'https://test.com',
      })

      expect(error!.name).toEqual('UnauthorizedError')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({
        user,
      })
    })

    it('successfully creates a webhook', async () => {
      const [data, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'https://test.com',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.name).toBe('Test Webhook')
      expect(data!.url).toBe('https://test.com')
      expect(data!.workspaceId).toBe(workspace.id)
      expect(data!.isActive).toBe(true)
      expect(data!.secret).toBeDefined()
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('successfully creates a webhook with project IDs', async () => {
      const [data, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'https://test.com',
        projectIds: JSON.stringify([1, 2, 3]),
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.projectIds).toEqual([1, 2, 3])
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('successfully creates an inactive webhook', async () => {
      const [data, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'https://test.com',
        isActive: 'false',
      })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.isActive).toBe(false)
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects invalid project IDs format', async () => {
      const [_, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'https://test.com',
        projectIds: 'invalid-json',
      })

      expect(error).toBeDefined()
      expect(error!.name).toEqual('BadRequestError')
      expect(error!.message).toContain('Invalid project IDs')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects invalid URL format', async () => {
      const [_, error] = await createWebhookAction({
        name: 'Test Webhook',
        url: 'not-a-url',
      })

      expect(error).toBeDefined()
      expect(error!.message).toContain('Invalid URL format')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })

    it('rejects empty name', async () => {
      const [_, error] = await createWebhookAction({
        name: '',
        url: 'https://test.com',
      })

      expect(error).toBeDefined()
      expect(error!.message).toContain('Name is required')
      expect(mocks.publisher.publishLater).not.toHaveBeenCalled()
    })
  })
})
