import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { Result } from '../../../lib/Result'
import { listApps, getApp, PipedreamNotConfiguredError } from './apps'
import { cache } from '../../../cache'
import { REDIS_KEY_PREFIX } from '../../../redis'
import type { Cache } from '../../../cache'
import {
  mockPipedreamClientBuilder,
  createMockPipedreamClient,
  emptyClientBuilder,
  errorClientBuilder,
  createErrorPipedreamClient,
} from './testHelpers/pipedreamMockClient'
import { ExtendedPipedreamApp } from '../../../constants'

let redis: Cache

beforeAll(async () => {
  redis = await cache()
})

afterEach(async () => {
  const pattern = `${REDIS_KEY_PREFIX}pipedream:apps:test*`
  const keysWithPrefix = await redis.keys(pattern)

  if (keysWithPrefix.length > 0) {
    const keysWithoutPrefix = keysWithPrefix.map((key) =>
      key.replace(REDIS_KEY_PREFIX, ''),
    )
    await redis.del(...keysWithoutPrefix)
  }
})

afterAll(async () => {
  if (redis) {
    await redis.quit()
  }
})

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
      connect: { some: 'connect-data' },
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
      connect: { some: 'connect-data' },
      featuredWeight: 90,
    },
    {
      id: 'app3',
      name: 'OpenAI',
      nameSlug: 'openai',
      authType: 'keys',
      imgSrc: 'https://example.com/openai.png',
      categories: ['ai'],
      description: 'OpenAI API',
      customFieldsJson: '{}',
      connect: { some: 'connect-data' },
      featuredWeight: 95,
    },
    {
      id: 'app4',
      name: 'Anthropic',
      nameSlug: 'anthropic',
      authType: 'keys',
      imgSrc: 'https://example.com/anthropic.png',
      categories: ['ai'],
      description: 'Anthropic API',
      customFieldsJson: '{}',
      connect: { some: 'connect-data' },
      featuredWeight: 93,
    },
  ] satisfies ExtendedPipedreamApp[]

  it('should return apps with default parameters', async () => {
    const result = await listApps({
      pipedreamClientBuilder: mockPipedreamClientBuilder({ mockApps }),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      // Should have 2 apps after filtering (openai and anthropic removed)
      expect(result.value.apps).toHaveLength(2)
      // totalCount is from the API before filtering, so it's 4
      expect(result.value.totalCount).toBe(4)
      expect(result.value.cursor).toBe('test-cursor')
      const app1 = result.value.apps[0]
      const app2 = result.value.apps[1]
      expect(app1.nameSlug).toBe('test-app-1')
      expect(app2.nameSlug).toBe('test-app-2')
    }
  })

  it('should exclude customFieldsJson and connect from apps response', async () => {
    const result = await listApps({
      pipedreamClientBuilder: mockPipedreamClientBuilder({ mockApps }),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      // Ensure all apps do not have customFieldsJson or connect fields
      result.value.apps.forEach((app) => {
        expect(app).not.toHaveProperty('customFieldsJson')
        expect(app).not.toHaveProperty('connect')
      })
    }
  })

  it('should return empty array when no apps found', async () => {
    const result = await listApps({
      pipedreamClientBuilder: emptyClientBuilder,
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toEqual([])
    }
  })

  it('should handle cursor parameter correctly', async () => {
    const customCursorApps = [
      {
        id: 'cursor-app-1',
        name: 'Cursor App 1',
        nameSlug: 'cursor-app-1',
        authType: 'oauth',
        imgSrc: 'https://example.com/cursor1.png',
        categories: ['cursor'],
        description: 'App returned for custom cursor',
        featuredWeight: 80,
        connect: { some: 'connect-data' },
        customFieldsJson: '{}',
      },
    ] satisfies ExtendedPipedreamApp[]

    const mockClient = createMockPipedreamClient({
      mockApps, // Default first page
      mockAppsByCursor: {
        'custom-cursor': customCursorApps,
      },
    })
    const clientBuilder = () => Result.ok(mockClient)

    const result = await listApps({
      cursor: 'custom-cursor',
      pipedreamClientBuilder: clientBuilder,
    })

    // Verify the cursor was passed to the API
    expect(mockClient.__appsListSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        after: 'custom-cursor',
      }),
    )

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toHaveLength(1)
      expect(result.value.apps[0].nameSlug).toBe('cursor-app-1')
      expect(result.value.cursor).toBe('test-cursor')
    }
  })

  it('should return error when pipedream client builder fails', async () => {
    const result = await listApps({
      pipedreamClientBuilder: errorClientBuilder('Failed to create client'),
    })

    expect(result.ok).toBe(false)

    if (!Result.isOk(result)) {
      expect(result.error.message).toBe('Failed to create client')
    }
  })

  it('should return empty result when Pipedream credentials are not configured', async () => {
    // Mock the getPipedreamClient to return a PipedreamNotConfiguredError
    const result = await listApps({
      pipedreamClientBuilder: () =>
        Result.error(new PipedreamNotConfiguredError()),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.apps).toEqual([])
      expect(result.value.totalCount).toBe(0)
      expect(result.value.cursor).toBe('')
    }
  })

  it('should handle apps API error gracefully', async () => {
    const result = await listApps({
      pipedreamClientBuilder: createErrorPipedreamClient({
        appsListError: 'Apps API failed',
      }),
    })

    expect(result.ok).toBe(false)

    if (!Result.isOk(result)) {
      expect(result.error.message).toBe('Apps API failed')
    }
  })

  it('should call apps.list with correct parameters', async () => {
    const mockClient = createMockPipedreamClient({ mockApps })
    const clientBuilder = () => Result.ok(mockClient)

    await listApps({
      query: 'test-query',
      cursor: 'test-cursor',
      pipedreamClientBuilder: clientBuilder,
    })

    // Verify apps.list was called with the correct parameters
    expect(mockClient.__appsListSpy).toHaveBeenCalledWith({
      q: 'test-query',
      limit: 30,
      after: 'test-cursor',
      sortKey: expect.any(String),
      sortDirection: expect.any(String),
    })
  })

  it('should filter out disallowed apps (openai and anthropic)', async () => {
    const result = await listApps({
      pipedreamClientBuilder: mockPipedreamClientBuilder({ mockApps }),
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      // Should only have 2 apps, not 4 (openai and anthropic filtered out)
      expect(result.value.apps).toHaveLength(2)

      // Verify disallowed apps are not in the results
      const nameSlugs = result.value.apps.map((app) => app.nameSlug)
      expect(nameSlugs).not.toContain('openai')
      expect(nameSlugs).not.toContain('anthropic')

      // Verify allowed apps are in the results
      expect(nameSlugs).toContain('test-app-1')
      expect(nameSlugs).toContain('test-app-2')
    }
  })

  it('should bypass cache when query parameter is provided', async () => {
    // First, cache the first page
    const firstPageClient = createMockPipedreamClient({ mockApps })
    const firstPageBuilder = () => Result.ok(firstPageClient)

    const cachedResult = await listApps({
      pipedreamClientBuilder: firstPageBuilder,
    })

    expect(firstPageClient.__appsListSpy).toHaveBeenCalledTimes(1)
    expect(cachedResult.ok).toBe(true)

    // Now call with query - should NOT return cached first page
    const searchApps = [
      {
        id: 'search-result-1',
        name: 'Search Result App',
        nameSlug: 'search-result-app',
        authType: 'oauth',
        imgSrc: 'https://example.com/search.png',
        categories: ['search'],
        description: 'A search result',
        featuredWeight: 50,
        connect: { some: 'connect-data' },
        customFieldsJson: '{}',
      },
    ] satisfies ExtendedPipedreamApp[]

    const searchClient = createMockPipedreamClient({
      mockApps, // Default first page
      mockAppsByQuery: (query) => {
        if (query === 'search-term') return searchApps
        return []
      },
    })
    const searchBuilder = () => Result.ok(searchClient)

    const searchResult = await listApps({
      query: 'search-term',
      pipedreamClientBuilder: searchBuilder,
    })

    // Verify the API was called (cache was bypassed)
    expect(searchClient.__appsListSpy).toHaveBeenCalledTimes(1)

    // Verify the query was passed to the API
    expect(searchClient.__appsListSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'search-term',
      }),
    )

    // Verify we got search results, NOT the cached first page
    expect(searchResult.ok).toBe(true)
    if (Result.isOk(searchResult)) {
      expect(searchResult.value.apps).toHaveLength(1)
      expect(searchResult.value.apps[0].nameSlug).toBe('search-result-app')
      // Verify it's NOT the cached first page apps
      expect(searchResult.value.apps[0].nameSlug).not.toBe('test-app-1')
      expect(searchResult.value.apps[0].nameSlug).not.toBe('test-app-2')
    }
  })

  it('should bypass cache when cursor parameter is provided', async () => {
    // First, cache the first page
    const firstPageClient = createMockPipedreamClient({ mockApps })
    const firstPageBuilder = () => Result.ok(firstPageClient)

    const cachedResult = await listApps({
      pipedreamClientBuilder: firstPageBuilder,
    })

    expect(firstPageClient.__appsListSpy).toHaveBeenCalledTimes(1)
    expect(cachedResult.ok).toBe(true)

    // Now call with cursor - should NOT return cached first page
    const page2Apps = [
      {
        id: 'page-2-app-1',
        name: 'Page 2 App',
        nameSlug: 'page-2-app',
        authType: 'keys',
        imgSrc: 'https://example.com/page2.png',
        categories: ['page2'],
        description: 'An app from page 2',
        featuredWeight: 30,
        connect: { some: 'connect-data' },
        customFieldsJson: '{}',
      },
    ] satisfies ExtendedPipedreamApp[]

    const page2Client = createMockPipedreamClient({
      mockApps, // Default first page
      mockAppsByCursor: {
        'page-2-cursor': page2Apps,
      },
    })
    const page2Builder = () => Result.ok(page2Client)

    const page2Result = await listApps({
      cursor: 'page-2-cursor',
      pipedreamClientBuilder: page2Builder,
    })

    // Verify the API was called (cache was bypassed)
    expect(page2Client.__appsListSpy).toHaveBeenCalledTimes(1)

    // Verify the cursor was passed to the API
    expect(page2Client.__appsListSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        after: 'page-2-cursor',
      }),
    )

    expect(page2Result.value?.apps[0].nameSlug).not.toBe('test-app-1')
    expect(page2Result.value?.apps[0].nameSlug).not.toBe('test-app-2')
    expect(page2Result.value?.apps).toHaveLength(1)
    expect(page2Result.value?.apps[0].nameSlug).toBe('page-2-app')
  })

  it('should use cache for first page (no query, no cursor)', async () => {
    const mockClient = createMockPipedreamClient({ mockApps })
    const clientBuilder = () => Result.ok(mockClient)

    // First call should hit the API and cache the result
    const result1 = await listApps({
      pipedreamClientBuilder: clientBuilder,
    })

    expect(mockClient.__appsListSpy).toHaveBeenCalledTimes(1)
    expect(result1.ok).toBe(true)

    // Second call should hit the cache
    // (reuse same client to verify API isn't called again)
    const result2 = await listApps({
      pipedreamClientBuilder: clientBuilder,
    })

    // Still 1 - second call used cache
    expect(mockClient.__appsListSpy).toHaveBeenCalledTimes(1)
    expect(result2.ok).toBe(true)
    expect(result2.value?.apps).toHaveLength(result1.value?.apps?.length ?? 0)
  })
})

describe('getApp', () => {
  const mockApp = {
    id: 'slack',
    name: 'Slack',
    nameSlug: 'slack',
    authType: 'oauth',
    imgSrc: 'https://example.com/slack.png',
    categories: ['communication'],
    description: 'Team collaboration tool',
    customFieldsJson: '{}',
    connect: { some: 'connect-data' },
    featuredWeight: 100,
  } satisfies ExtendedPipedreamApp

  const mockTool = {
    key: 'slack_send_message',
    name: 'Send Message',
    description: 'Send a message to a channel',
    componentType: 'action', // PipedreamComponentType.Tool
    configurableProps: [
      { name: 'channel', type: 'string' },
      { name: 'text', type: 'string' },
    ],
  }

  const mockTrigger = {
    key: 'slack_new_message',
    name: 'New Message',
    description: 'Triggered when a new message is posted',
    componentType: 'source', // PipedreamComponentType.Trigger
    configurableProps: [{ name: 'channel', type: 'string' }],
  }

  it('should retrieve and cache a single app by nameSlug with config', async () => {
    const mockBuilder = mockPipedreamClientBuilder({
      mockApp,
      mockComponents: [mockTool, mockTrigger],
    })

    const result = await getApp({
      name: 'slack',
      withConfig: true,
      pipedreamClientBuilder: mockBuilder,
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.nameSlug).toBe('slack')
      expect(result.value.name).toBe('Slack')
      expect(result.value).toHaveProperty('tools')
      expect(result.value).toHaveProperty('triggers')
      // Check that tools have configurableProps
      expect(result.value.tools[0]).toHaveProperty('configurableProps')
      expect(result.value.tools[0].configurableProps).toEqual(
        mockTool.configurableProps,
      )
    }
  })

  it('should retrieve and cache a single app by nameSlug without config (slim)', async () => {
    const mockBuilder = mockPipedreamClientBuilder({
      mockApp,
      mockComponents: [mockTool, mockTrigger],
    })

    const result = await getApp({
      name: 'slack',
      withConfig: false,
      pipedreamClientBuilder: mockBuilder,
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value.nameSlug).toBe('slack')
      expect(result.value.name).toBe('Slack')
      expect(result.value).toHaveProperty('tools')
      expect(result.value).toHaveProperty('triggers')
      // Check that tools do NOT have configurableProps when withConfig is false
      expect(result.value.tools[0]).not.toHaveProperty('configurableProps')
      expect(result.value.triggers[0]).not.toHaveProperty('configurableProps')
    }
  })

  it('should exclude customFieldsJson and connect from app response', async () => {
    const mockBuilder = mockPipedreamClientBuilder({
      mockApp,
      mockComponents: [],
    })

    const result = await getApp({
      name: 'slack',
      pipedreamClientBuilder: mockBuilder,
      withConfig: true,
    })

    expect(result.ok).toBe(true)
    if (Result.isOk(result)) {
      // Ensure app does not have customFieldsJson or connect fields
      expect(result.value).not.toHaveProperty('customFieldsJson')
      expect(result.value).not.toHaveProperty('connect')
    }
  })

  it('should handle errors when retrieving nonexistent app', async () => {
    const result = await getApp({
      name: 'nonexistent',
      pipedreamClientBuilder: createErrorPipedreamClient({
        appsRetrieveError: 'App not found',
      }),
      withConfig: true,
    })

    expect(result.ok).toBe(false)
    if (!Result.isOk(result)) {
      expect(result.error.message).toContain('App not found')
    }
  })
})
