// FIXME::
// If we update Pipedream SDK and types changed will NOT notice and this
// will not fail and error will arrive to production undetected.
import type { PipedreamClient } from '@pipedream/sdk/server'

import type { PageInfo } from '@pipedream/sdk'
import { ExtendedPipedreamApp } from '../../../../constants'
import { vi } from 'vitest'
import { Result, TypedResult } from '../../../../lib/Result'
import type { Page } from '../helpers/page'

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
export type MockClientWithSpies = PipedreamClient & {
  __appsListSpy?: ReturnType<typeof vi.fn>
  __appsRetrieveSpy?: ReturnType<typeof vi.fn>
  __componentsListSpy?: ReturnType<typeof vi.fn>
}

export function createMockPipedreamClient({
  mockApps = [],
  mockApp,
  mockComponents = [],
  mockAppsByQuery,
  mockAppsByCursor,
}: {
  mockApps?: ExtendedPipedreamApp[]
  mockApp?: ExtendedPipedreamApp
  mockComponents?: Array<{
    key: string
    name: string
    description?: string
    componentType: string
    configurableProps?: unknown[]
  }>
  mockAppsByQuery?: (query: string) => ExtendedPipedreamApp[]
  mockAppsByCursor?: Record<string, ExtendedPipedreamApp[]>
} = {}): MockClientWithSpies {
  const appsListSpy = vi.fn()
  const appsRetrieveSpy = vi.fn()
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

        // Return different data based on cursor
        if (opts.after && mockAppsByCursor && mockAppsByCursor[opts.after]) {
          return createMockPage(mockAppsByCursor[opts.after])
        }

        // Return different data based on query
        if (opts.q && mockAppsByQuery) {
          return createMockPage(mockAppsByQuery(opts.q))
        }

        // Default response
        return createMockPage(mockApps)
      },
      retrieve: async (nameSlug: string) => {
        appsRetrieveSpy(nameSlug)
        if (!mockApp) {
          throw new Error(`No mock app provided for retrieve`)
        }
        return { data: mockApp }
      },
    } as unknown as PipedreamClient['apps'],
    components: {
      list: async () => {
        componentsListSpy()
        return {
          data: mockComponents,
          hasNextPage: () => false,
          getNextPage: async () => ({ data: [] }),
        }
      },
    } as unknown as PipedreamClient['components'],
  }

  const clientWithSpies = mockClient as MockClientWithSpies
  clientWithSpies.__appsListSpy = appsListSpy
  clientWithSpies.__appsRetrieveSpy = appsRetrieveSpy
  clientWithSpies.__componentsListSpy = componentsListSpy

  return clientWithSpies
}

export const mockPipedreamClientBuilder = (
  options: Parameters<typeof createMockPipedreamClient>[0] = {},
): (() => TypedResult<PipedreamClient, Error>) => {
  return () => Result.ok(createMockPipedreamClient(options))
}

export const emptyClientBuilder = () =>
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
  } as unknown as PipedreamClient)

// Error builders for testing error handling
export const errorClientBuilder = (
  message = 'Failed to create client',
): (() => TypedResult<PipedreamClient, Error>) => {
  return () => Result.error(new Error(message))
}

export const createErrorPipedreamClient = ({
  appsListError,
  appsRetrieveError,
  componentsListError,
}: {
  appsListError?: string
  appsRetrieveError?: string
  componentsListError?: string
} = {}): (() => TypedResult<PipedreamClient, Error>) => {
  return () =>
    Result.ok({
      apps: {
        list: async () => {
          if (appsListError) {
            return Promise.reject(new Error(appsListError))
          }
          return createMockPage([])
        },
        retrieve: async () => {
          if (appsRetrieveError) {
            return Promise.reject(new Error(appsRetrieveError))
          }
          throw new Error('No mock app configured')
        },
      },
      components: {
        list: async () => {
          if (componentsListError) {
            return Promise.reject(new Error(componentsListError))
          }
          return {
            data: [],
            hasNextPage: () => false,
            getNextPage: async () => ({ data: [] }),
          }
        },
      },
    } as unknown as PipedreamClient)
}
