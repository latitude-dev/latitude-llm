import { describe, expect, it, vi } from 'vitest'

import { NotFoundError } from '../../lib/errors'
import { publisher } from '../../events/publisher'
import { getWebhook } from './getWebhook'

// @ts-expect-error - Mock
vi.spyOn(publisher, 'publishLater').mockImplementation(() => {})

describe('getWebhook', () => {
  it('returns webhook when found', async (ctx) => {
    const { workspace } = await ctx.factories.createWorkspace()
    const webhook = await ctx.factories.createWebhook({
      workspaceId: workspace.id,
      name: 'Test Webhook',
      url: 'https://test.com/webhook',
      projectIds: [],
      isActive: true,
    })

    const result = await getWebhook(webhook.id, workspace)

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(webhook)
  })

  it('returns NotFoundError when webhook does not exist', async (ctx) => {
    const { workspace } = await ctx.factories.createWorkspace()

    const result = await getWebhook(999999, workspace)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error!.message).toBe('Webhook not found')
  })

  it('returns NotFoundError when webhook belongs to different workspace', async (ctx) => {
    const { workspace: workspace1 } = await ctx.factories.createWorkspace()
    const { workspace: workspace2 } = await ctx.factories.createWorkspace()
    const webhook = await ctx.factories.createWebhook({
      workspaceId: workspace2.id,
      name: 'Test Webhook',
      url: 'https://test.com/webhook',
      projectIds: [],
      isActive: true,
    })

    const result = await getWebhook(webhook.id, workspace1)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(NotFoundError)
    expect(result.error!.message).toBe('Webhook not found')
  })
})
