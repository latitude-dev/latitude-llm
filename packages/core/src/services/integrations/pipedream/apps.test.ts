import { describe, it, expect, vi } from 'vitest'
import { Result, TypedResult } from '../../../lib/Result'
import { listApps } from './apps'
import type {
  BackendClient,
  GetAppsOpts,
  GetAppsResponse,
  GetComponentsOpts,
  GetComponentsResponse,
  App,
  V1Component,
} from '@pipedream/sdk/server'
import { AppAuthType } from '@pipedream/sdk/server'

describe('listApps', () => {
  const mockApps = [
    {
      id: 'app1',
      name: 'Test App 1',
      name_slug: 'test-app-1',
      auth_type: AppAuthType.OAuth,
      img_src: 'https://example.com/app1.png',
      categories: ['productivity'],
      description: 'A test app for productivity',
      custom_fields_json: '{}',
      featured_weight: 100,
    },
    {
      id: 'app2',
      name: 'Test App 2',
      name_slug: 'test-app-2',
      auth_type: AppAuthType.Keys,
      img_src: 'https://example.com/app2.png',
      categories: ['communication'],
      description: 'A test app for communication',
      custom_fields_json: '{}',
      featured_weight: 90,
    },
  ] satisfies App[]

  const mockComponents = [
    {
      name: 'Test Component 1',
      key: 'test-app-1-action',
      version: '1.0.0',
      configurable_props: [],
      component_type: 'action',
    },
    {
      name: 'Test Component 2',
      key: 'test-app-2-trigger',
      version: '1.0.0',
      configurable_props: [],
      component_type: 'trigger',
    },
  ] satisfies V1Component[]

  // Type for our mock client with spy methods attached
  type MockClientWithSpies = BackendClient & {
    __getAppsSpy: ReturnType<typeof vi.fn>
    __getComponentsSpy: ReturnType<typeof vi.fn>
  }

  const createMockPipedreamClient = (): MockClientWithSpies => {
    const getAppsSpy = vi.fn()
    const getComponentsSpy = vi.fn()

    const mockClient: Partial<BackendClient> = {
      getApps: (opts: GetAppsOpts = {}): Promise<GetAppsResponse> => {
        getAppsSpy(opts)
        // For testing purposes, we'll add integrations as a custom property
        // This simulates the behavior that the listApps function expects
        const appsWithIntegrations = mockApps.map((app) => ({
          ...app,
          ...(opts.hasComponents && {
            integrations: mockComponents.filter((c) =>
              c.key.includes(app.name_slug),
            ),
          }),
        }))
        return Promise.resolve({
          data: appsWithIntegrations,
          page_info: {
            total_count: appsWithIntegrations.length,
            end_cursor: 'test-cursor',
            count: appsWithIntegrations.length,
            start_cursor: 'start-cursor',
          },
        })
      },
      getComponents: (
        opts: GetComponentsOpts = {},
      ): Promise<GetComponentsResponse> => {
        getComponentsSpy(opts)
        return Promise.resolve({
          data: mockComponents,
          page_info: {
            total_count: mockComponents.length,
            end_cursor: 'comp-cursor',
            count: mockComponents.length,
            start_cursor: 'comp-start-cursor',
          },
        })
      },
    }

    // Attach spies to the mock for testing
    const clientWithSpies = mockClient as MockClientWithSpies
    clientWithSpies.__getAppsSpy = getAppsSpy
    clientWithSpies.__getComponentsSpy = getComponentsSpy

    return clientWithSpies
  }

  const mockPipedreamClientBuilder = (): (() => TypedResult<
    BackendClient,
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
      expect(result.value.apps[0]).toEqual(mockApps[0])
      expect(result.value.apps[1]).toEqual(mockApps[1])
    }
  })

  it('should return apps without triggers when withTriggers is false', async () => {
    const result = await listApps({
      withTriggers: false,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.apps[0]).not.toHaveProperty('triggerCount')
      expect(result.value.apps[1]).not.toHaveProperty('triggerCount')
    }
  })

  it('should return apps with triggers when withTriggers is true', async () => {
    const result = await listApps({
      withTriggers: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      // Apps should have triggerCount added by fetchTriggerCounts
      expect(result.value.apps[0]).toHaveProperty('triggerCount')
      expect(result.value.apps[1]).toHaveProperty('triggerCount')
    }
  })

  it('should return apps without integrations when withTools is false', async () => {
    const result = await listApps({
      withTools: false,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.apps[0]).not.toHaveProperty('integrations')
      expect(result.value.apps[1]).not.toHaveProperty('integrations')
    }
  })

  it('should return apps with integrations when withTools is true', async () => {
    const result = await listApps({
      withTools: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      // Apps should have integrations added
      expect(result.value.apps[0]).toHaveProperty('integrations')
      expect(result.value.apps[1]).toHaveProperty('integrations')
    }
  })

  it('should return apps with both triggers and integrations when both flags are true', async () => {
    const result = await listApps({
      withTriggers: true,
      withTools: true,
      pipedreamClientBuilder: mockPipedreamClientBuilder(),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(2)
      expect(result.value.apps[0]).toHaveProperty('triggerCount')
      expect(result.value.apps[0]).toHaveProperty('integrations')
      expect(result.value.apps[1]).toHaveProperty('triggerCount')
      expect(result.value.apps[1]).toHaveProperty('integrations')
    }
  })

  it('should return empty array when no apps found', async () => {
    const emptyClientBuilder = () =>
      Result.ok({
        getApps: () =>
          Promise.resolve({
            data: [],
            page_info: {
              total_count: 0,
              end_cursor: '',
              count: 0,
              start_cursor: '',
            },
          }),
        getComponents: () =>
          Promise.resolve({
            data: [],
            page_info: {
              total_count: 0,
              end_cursor: '',
              count: 0,
              start_cursor: '',
            },
          }),
      } as unknown as BackendClient)

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
        getApps: () => Promise.reject(new Error('Apps API failed')),
        getComponents: () =>
          Promise.resolve({
            data: mockComponents,
            page_info: {
              total_count: mockComponents.length,
              end_cursor: 'comp-cursor',
              count: mockComponents.length,
              start_cursor: 'comp-start-cursor',
            },
          }),
      } as unknown as BackendClient)

    const result = await listApps({
      pipedreamClientBuilder: errorClientBuilder,
    })

    expect(result.ok).toBe(false)

    if (!Result.isOk(result)) {
      expect(result.error.message).toBe('Apps API failed')
    }
  })

  it('should handle components API error when withTools is true', async () => {
    const errorClientBuilder = () =>
      Result.ok({
        getApps: ({ hasComponents }: { hasComponents?: boolean } = {}) => {
          if (hasComponents) {
            return Promise.reject(new Error('Components API failed'))
          }
          return Promise.resolve({
            data: mockApps,
            page_info: {
              total_count: mockApps.length,
              end_cursor: 'test-cursor',
              count: mockApps.length,
              start_cursor: 'start-cursor',
            },
          })
        },
        getComponents: () =>
          Promise.resolve({
            data: mockComponents,
            page_info: {
              total_count: mockComponents.length,
              end_cursor: 'comp-cursor',
              count: mockComponents.length,
              start_cursor: 'comp-start-cursor',
            },
          }),
      } as unknown as BackendClient)

    const result = await listApps({
      withTools: true,
      pipedreamClientBuilder: errorClientBuilder,
    })

    expect(result.ok).toBe(false)
    if (!Result.isOk(result)) {
      expect(result.error?.message).toBe('Components API failed')
    }
  })

  it('should not call components API when withTools is false', async () => {
    let componentsApiCalled = false
    const clientBuilder = () =>
      Result.ok({
        getApps: () =>
          Promise.resolve({
            data: mockApps,
            page_info: {
              total_count: mockApps.length,
              end_cursor: 'test-cursor',
              count: mockApps.length,
              start_cursor: 'start-cursor',
            },
          }),
        getComponents: () => {
          componentsApiCalled = true
          return Promise.resolve({
            data: mockComponents,
            page_info: {
              total_count: mockComponents.length,
              end_cursor: 'comp-cursor',
              count: mockComponents.length,
              start_cursor: 'comp-start-cursor',
            },
          })
        },
      } as unknown as BackendClient)

    const result = await listApps({
      withTools: false,
      pipedreamClientBuilder: clientBuilder,
    })

    expect(result.ok).toBe(true)
    expect(componentsApiCalled).toBe(false)
  })

  it('should call getApps with correct parameters when withTools is true', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      withTools: true,
      query: 'test-query',
      cursor: 'test-cursor',
      pipedreamClientBuilder: clientBuilder,
    })

    // Verify getApps was called with the correct parameters
    expect(mockClient.__getAppsSpy).toHaveBeenCalledWith({
      hasComponents: true,
      hasTriggers: false,
      q: 'test-query',
      after: 'test-cursor',
      limit: 64,
    })
  })

  it('should call getApps with correct parameters when withTools is false', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      withTools: false,
      query: 'test-query',
      pipedreamClientBuilder: clientBuilder,
    })

    expect(mockClient.__getAppsSpy).toHaveBeenCalledWith({
      hasTriggers: false,
      q: 'test-query',
      after: undefined,
      limit: 64,
    })
  })

  it('should call getApps without hasComponents when only withTriggers is true', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      withTriggers: true,
      withTools: false,
      query: 'test-query',
      pipedreamClientBuilder: clientBuilder,
    })

    // Verify getApps was called without hasComponents parameter
    expect(mockClient.__getAppsSpy).toHaveBeenCalledWith({
      hasTriggers: true,
      q: 'test-query',
      after: undefined,
      limit: 64,
    })
  })

  it('should not call getComponents directly', async () => {
    const mockClient = createMockPipedreamClient()
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      withTools: true,
      pipedreamClientBuilder: clientBuilder,
    })

    expect(mockClient.__getComponentsSpy).not.toHaveBeenCalled()
  })
})
