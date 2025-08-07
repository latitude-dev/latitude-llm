import { beforeEach, describe, expect, it, vi } from 'vitest'

import { User, Workspace } from '../../../browser'
import { ProductEdition } from '../collectors/DataCollector'

describe('PosthogProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('correctly init Posthog', async () => {
    const PostHogMock = vi.fn()
    vi.doMock('posthog-node', () => {
      return { PostHog: PostHogMock }
    })
    const mod = await import('./Posthog')
    const { PosthogProvider } = mod
    new PosthogProvider()
    expect(PostHogMock).toHaveBeenNthCalledWith(
      1,
      'phc_4R5q3ZzjJ3biZ9SandlYXn5SceEa5KoKeQ7u4hsW8vF',
      {
        host: 'https://eu.i.posthog.com',
        flushAt: 1,
        flushInterval: 0,
      },
    )
  })

  it('implements capture', async () => {
    const captureMock = vi.fn()
    const shutdownMock = vi.fn()
    vi.doMock('posthog-node', () => {
      return {
        PostHog: vi.fn().mockImplementation(() => ({
          capture: captureMock,
          shutdown: shutdownMock,
        })),
      }
    })
    const mod = await import('./Posthog')
    const provider = new mod.PosthogProvider()
    const payload = {
      disableGeoip: true as const,
      distinctId: 'hello@example.com',
      event: 'workspaceCreated',
      properties: {
        productEdition: 'cloud' as ProductEdition,
        appDomain: 'latitude.so',
        workspaceId: undefined,
        workspaceUuid: undefined,
        data: {
          workspace: {} as Workspace,
          user: {} as User,
          workspaceId: 123,
          userEmail: 'hello@example.com',
        },
      },
    }
    await provider.capture(payload)

    expect(captureMock).toHaveBeenNthCalledWith(1, {
      distinctId: payload.distinctId,
      event: payload.event,
      properties: payload.properties,
    })

    expect(shutdownMock).toHaveBeenCalledOnce()
  })
})
