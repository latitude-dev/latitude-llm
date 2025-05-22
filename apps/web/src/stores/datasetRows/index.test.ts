// @vitest-environment jsdom

import { omit } from 'lodash-es'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useDatasetRows from './index'
import { DatasetRow, Dataset } from '@latitude-data/core/browser'
import { type UseFetcherArgs } from '$/hooks/useFetcher'

vi.mock('@latitude-data/web-ui/atoms/Toast', async (mod) => {
  const originalModule =
    (await mod()) as typeof import('@latitude-data/web-ui/atoms/Toast')
  return {
    ...originalModule,
    useToast: vi.fn(() => ({
      state: {},
      setState: vi.fn(),
    })),
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

function mockFetcherImplementation(...args: UseFetcherArgs) {
  const options = args[1]
  const rows = options?.serializer?.(MOCK_ROWS)
  return () => {
    return Promise.resolve(rows)
  }
}
const mocks = vi.hoisted(() => ({
  useFetcher: vi.fn(mockFetcherImplementation),
}))

vi.mock('$/hooks/useFetcher', () => ({
  default: mocks.useFetcher,
}))

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
