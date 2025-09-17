import { describe, it, expect, vi } from 'vitest'
import { Result, TypedResult } from '../../../lib/Result'
import { listApps } from './apps'
import type { PipedreamClient } from '@pipedream/sdk/server'
import type { PageInfo } from '@pipedream/sdk'
import type { Page } from './helpers/page'

describe('listApps', () => {
  const mockApps = [
    {
      id: 'app1',
      name: 'Test App 1',
      nameSlug: 'test-app-1',
      authType: 'oauth',
      imgSrc: 'https://example.com/app1.png',
      categories: ['productivity'],
      description: 'A test app for productivity',
      customFieldsJson: '{}',
      featuredWeight: 100,
    },
    {
      id: 'app2',
      name: 'Test App 2',
      nameSlug: 'test-app-2',
      authType: 'keys',
      imgSrc: 'https://example.com/app2.png',
      categories: ['communication'],
      description: 'A test app for communication',
      customFieldsJson: '{}',
      featuredWeight: 90,
    },
  ]

  const mockComponents = [
    {
      name: 'Test Component 1',
      key: 'test-app-1-action',
      version: '1.0.0',
      componentType: 'action',
    },
    {
      name: 'Test Component 2',
      key: 'test-app-2-trigger',
      version: '1.0.0',
      componentType: 'source',
    },
  ]

  // Type for our mock client with spy methods attached
  type MockClientWithSpies = PipedreamClient & {
    __appsListSpy: ReturnType<typeof vi.fn>
    __componentsListSpy: ReturnType<typeof vi.fn>
  }

  const createMockPage = <T>(
    data: T[],
    pageInfo?: PageInfo,
  ): Page<T> & { response: { pageInfo: PageInfo } } => {
    const info: PageInfo = pageInfo ?? {
      totalCount: data.length,
      endCursor: 'test-cursor',
      count: data.length,
      startCursor: 'start-cursor',
    }

    return {
      data,
      hasNextPage: () => false,
      getNextPage: async () => {
        const empty: T[] = []
        return {
          data: empty,
          hasNextPage: () => false,
          getNextPage: async () => {
            throw new Error('No next page')
          },
          [Symbol.asyncIterator]: function (): AsyncIterator<T, void, unknown> {
            let index = 0
            return {
              next: async (
                _value?: unknown,
              ): Promise<IteratorResult<T, void>> => {
                if (index < empty.length)
                  return { value: empty[index++] as T, done: false }
                return { value: undefined as void, done: true }
              },
            }
          },
          response: { pageInfo: info },
        }
      },
      [Symbol.asyncIterator]: function (): AsyncIterator<T, void, unknown> {
        let index = 0
        return {
          next: async (_value?: unknown): Promise<IteratorResult<T, void>> => {
            if (index < data.length)
              return { value: data[index++] as T, done: false }
            return { value: undefined as void, done: true }
          },
        }
      },
      response: { pageInfo: info },
    }
  }

  const createMockPipedreamClient = (): MockClientWithSpies => {
    const appsListSpy = vi.fn()
    const componentsListSpy = vi.fn()

    const mockClient: Partial<PipedreamClient> = {
      apps: {
        list: async (opts: {
          q?: string
          limit?: number
          after?: string
          sortKey?: string
          sortDirection?: string
        }) => {
          appsListSpy(opts)
          return createMockPage(mockApps)
        },
      } as unknown as PipedreamClient['apps'],
      components: {
        list: async (opts: { app: string; limit?: number }) => {
          componentsListSpy(opts)
          const data = mockComponents.filter((c) => c.key.includes(opts.app))
          return createMockPage(data, {
            totalCount: data.length,
            endCursor: 'comp-cursor',
            count: data.length,
            startCursor: 'comp-start-cursor',
          })
        },
      } as unknown as PipedreamClient['components'],
    }

    const clientWithSpies = mockClient as MockClientWithSpies
    clientWithSpies.__appsListSpy = appsListSpy
    clientWithSpies.__componentsListSpy = componentsListSpy

    return clientWithSpies
  }

  const mockPipedreamClientBuilder = (): (() => TypedResult<
    PipedreamClient,
    Error
  >) => {
    return () => Result.ok(createMockPipedreamClient())
  }

  it('should return apps with default parameters', async () => {
    const result = await listApps({
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.totalCount).toBe(2)
      expect(result.value.cursor).toBe('test-cursor')
      // tools/triggers are always included now
      const app1 = result.value.apps[0]
      const app2 = result.value.apps[1]
      expect(app1.nameSlug).toBe('test-app-1')
      expect(app2.nameSlug).toBe('test-app-2')
      expect(app1.tools.length).toBeGreaterThanOrEqual(1)
      expect(app1.triggers.length).toBe(0)
      expect(app2.triggers.length).toBeGreaterThanOrEqual(1)
      expect(app2.tools.length).toBe(0)
    }
  })

  it('should return all apps when withTriggers is false', async () => {
    const result = await listApps({
      withTriggers: false,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.apps.every((a) => 'triggers' in a)).toBe(true)
    }
  })

  it('should filter apps by triggers when withTriggers is true', async () => {
    const result = await listApps({
      withTriggers: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps.every((a) => a.triggers.length > 0)).toBe(true)
      expect(result.value.apps).toHaveLength(1)
      expect(result.value.apps[0].nameSlug).toBe('test-app-2')
    }
  })

  it('should return all apps when withTools is false', async () => {
    const result = await listApps({
      withTools: false,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.apps.every((a) => 'tools' in a)).toBe(true)
    }
  })

  it('should filter apps by tools when withTools is true', async () => {
    const result = await listApps({
      withTools: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps.every((a) => a.tools.length > 0)).toBe(true)
      expect(result.value.apps).toHaveLength(1)
      expect(result.value.apps[0].nameSlug).toBe('test-app-1')
    }
  })

  it('should return apps with both triggers and tools when both flags are true', async () => {
    const result = await listApps({
      withTriggers: true,
      withTools: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      // With our mock data, no app has both a tool and a trigger
      expect(result.value.apps).toHaveLength(0)
    }
  })

  it('should return empty array when no apps found', async () => {
    const emptyClientBuilder = () =>
      Result.ok({
        apps: {
          list: async () =>
            createMockPage([], {
              totalCount: 0,
              endCursor: '',
              count: 0,
              startCursor: '',
            }),
        },
        components: {
          list: async () => createMockPage([]),
        },
      } as unknown as PipedreamClient)

    const result = await listApps({
      pipedreamClientBuilder: emptyClientBuilder,
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toEqual([])
    }
  })

  it('should handle cursor parameter correctly', async () => {
    const result = await listApps({
      cursor: 'custom-cursor',
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.cursor).toBe('test-cursor')
    }
  })

  it('should return error when pipedream client builder fails', async () => {
    const errorClientBuilder = () =>
      Result.error(new Error('Failed to create client'))

    const result = await listApps({
      pipedreamClientBuilder: errorClientBuilder,
    })

    expect(result.ok).toBe(false)

    if (!Result.isOk(result)) {
      expect(result.error.message).toBe('Failed to create client')
    }
  })

  it('should handle apps API error gracefully', async () => {
    const errorClientBuilder = () =>
      Result.ok({
        apps: {
          list: async () => Promise.reject(new Error('Apps API failed')),
        },
        components: {
          list: async () => createMockPage(mockComponents as any),
        },
      } as unknown as PipedreamClient)

    const result = await listApps({
      pipedreamClientBuilder: errorClientBuilder,
    })

    expect(result.ok).toBe(false)

    if (!Result.isOk(result)) {
      expect(result.error.message).toBe('Apps API failed')
    }
  })

  it('should handle components API error', async () => {
    const errorClientBuilder = () =>
      Result.ok({
        apps: {
          list: async () => createMockPage(mockApps as any),
        },
        components: {
          list: async () => Promise.reject(new Error('Components API failed')),
        },
      } as unknown as PipedreamClient)

    const result = await listApps({
      pipedreamClientBuilder: errorClientBuilder,
    })

    expect(result.ok).toBe(false)
    if (!Result.isOk(result)) {
      expect(result.error?.message).toBe('Components API failed')
    }
  })

  it('should call components.list for each app', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () =>
      Result.ok(mockClient as unknown as PipedreamClient)

    const result = await listApps({
      pipedreamClientBuilder: clientBuilder,
    })

    expect(result.ok).toBe(true)
    expect(mockClient.__componentsListSpy).toHaveBeenCalledTimes(2)
    const calls = mockClient.__componentsListSpy.mock.calls.map(
      (args) => args[0],
    )
    const appsCalled = new Set(calls.map((c: any) => c.app))
    expect(appsCalled).toEqual(new Set(['test-app-1', 'test-app-2']))
    expect(calls.every((c: any) => c.limit === 64)).toBe(true)
  })

  it('should call apps.list with correct parameters', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      query: 'test-query',
      cursor: 'test-cursor',
      pipedreamClientBuilder: clientBuilder,
    })

    // Verify apps.list was called with the correct parameters
    expect(mockClient.__appsListSpy).toHaveBeenCalledWith({
      q: 'test-query',
      limit: 64,
      after: 'test-cursor',
      sortKey: expect.any(String),
      sortDirection: expect.any(String),
    })
  })

  // Components API is always called now as part of listApps
})
