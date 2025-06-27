// @vitest-environment jsdom

import { omit } from 'lodash-es'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import useDatasetRows from './datasetRows' // Assuming this is the correct path
import { DatasetRow, Dataset, ApiKey } from '@latitude-data/core/browser'
import { type UseFetcherArgs } from '$/hooks/useFetcher'
import useApiKeys from './apiKeys'
import * as apiKeyActions from '$/actions/apiKeys/update'

const mockToast = vi.fn(() => ({
  state: {},
  setState: vi.fn(),
}))

vi.mock('@latitude-data/web-ui/atoms/Toast', async (mod) => {
  const originalModule =
    (await mod()) as typeof import('@latitude-data/web-ui/atoms/Toast')
  return {
    ...originalModule,
    useToast: () => mockToast,
  }
})

const MOCK_DATASET = {
  id: 1,
  columns: [
    { name: 'comidaaaa', identifier: '7dagyMD' },
    { name: 'ingredients', identifier: 'AGqIoHr' },
    { name: 'cocinitas', identifier: 'KhdzZS0' },
    { name: 'losquecomen', identifier: 'FdBuNWV' },
  ],
} as Dataset

const MOCK_ROWS = [
  {
    id: 49,
    workspaceId: 1,
    datasetId: 21,
    rowData: {
      '7dagyMD': 'tortilla de patatas',
      AGqIoHr: '["patatas", "huevos", "aceite", "sal"]',
      FdBuNWV: '4',
      KhdzZS0: 'Paco Merlo',
    },
    createdAt: '2025-02-27T08:10:25.056Z',
    updatedAt: '2025-02-27T08:10:25.056Z',
  },
] as unknown as DatasetRow[]

function mockDatasetRowsFetcherImplementation(...args: UseFetcherArgs) {
  const options = args[1]
  const rows = options?.serializer?.(MOCK_ROWS)
  return () => {
    return Promise.resolve(rows)
  }
}

const MOCK_API_KEYS: ApiKey[] = [
  { id: 1, name: 'Key 1', token: 'token1********************key1', workspaceId: 1, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null },
  { id: 2, name: 'Key 2', token: 'token2********************key2', workspaceId: 1, createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null },
]

function mockApiKeysFetcherImplementation() {
  return () => Promise.resolve(MOCK_API_KEYS)
}

const mocks = vi.hoisted(() => ({
  useFetcherDatasetRows: vi.fn(mockDatasetRowsFetcherImplementation),
  useFetcherApiKeys: vi.fn(mockApiKeysFetcherImplementation),
  updateApiKeyAction: vi.fn(),
}))

vi.mock('$/hooks/useFetcher', () => ({
  default: (path: string) => {
    if (path.includes('dataset-rows')) {
      return mocks.useFetcherDatasetRows()
    }
    if (path.includes('apiKeys')) {
      return mocks.useFetcherApiKeys()
    }
    return vi.fn()
  },
}))

vi.mock('$/actions/apiKeys/update', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    updateApiKeyAction: mocks.updateApiKeyAction,
  }
})


describe('stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useDatasetRows', () => {
    it('should transform rowData into ordered independent cells', async () => {
      const { result } = renderHook(() => {
        const { data } = useDatasetRows(
          { dataset: MOCK_DATASET, page: '1', pageSize: '10' },
          {
            fallbackData: MOCK_ROWS,
          },
        )
        return data
      })

      act(() => {
        result.current
      })
      const row = MOCK_ROWS[0]!

      expect(result.current).toEqual([
        {
          ...omit(row, 'rowData'),
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          rowData: {
            '7dagyMD': 'tortilla de patatas',
            AGqIoHr: '["patatas", "huevos", "aceite", "sal"]',
            FdBuNWV: '4',
            KhdzZS0: 'Paco Merlo',
          },
          processedRowData: {
            '7dagyMD': 'tortilla de patatas',
            AGqIoHr: '["patatas", "huevos", "aceite", "sal"]',
            FdBuNWV: '4',
            KhdzZS0: 'Paco Merlo',
          },
        },
      ])
    })
  })

  describe('useApiKeys', () => {
    it('should fetch API keys', async () => {
      const { result } = renderHook(() => useApiKeys())
      await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0))
      expect(result.current.data).toEqual(MOCK_API_KEYS)
    })

    it('should update an API key and reflect changes in the local cache', async () => {
      const updatedApiKey: ApiKey = { ...MOCK_API_KEYS[0]!, name: 'Updated Key 1' }
      mocks.updateApiKeyAction.mockResolvedValue({ data: updatedApiKey, ok: true, error: null, status: 200 })

      const { result } = renderHook(() => useApiKeys({ fallbackData: MOCK_API_KEYS }))

      await act(async () => {
        await result.current.update({ id: updatedApiKey.id, name: updatedApiKey.name })
      })

      expect(mocks.updateApiKeyAction).toHaveBeenCalledWith({ id: updatedApiKey.id, name: updatedApiKey.name })
      expect(result.current.data.find(k => k.id === updatedApiKey.id)?.name).toBe('Updated Key 1')
      // expect(mockToast).toHaveBeenCalledWith({ title: 'Success', description: `API key "${updatedApiKey.name}" updated successfully` })
    })
  })
})
