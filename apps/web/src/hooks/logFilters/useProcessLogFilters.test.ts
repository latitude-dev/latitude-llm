// @vitest-environment jsdom

import { type DocumentLogFilterOptions, LOG_SOURCES, LogSources } from '@latitude-data/core/browser'
import { act, renderHook } from '@testing-library/react'
import { parseISO } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProcessLogFilters } from './useProcessLogFilters'

const mocks = vi.hoisted(() => ({
  push: vi.fn(async (path: string) => {
    return path
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mocks.push,
  })),
  usePathname: vi.fn(() => '/test-path'),
}))

Object.defineProperty(window, 'location', {
  value: {
    search: '',
  },
  writable: true,
})

const ORIGINAL_COMMIT_IDS = [1, 2]
const FILTER_OPTIONS: DocumentLogFilterOptions = {
  commitIds: ORIGINAL_COMMIT_IDS,
  logSources: LOG_SOURCES,
  createdAt: undefined,
  customIdentifier: undefined,
  experimentId: undefined,
}

describe('useProcessLogFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.search = ''
  })

  it('isCommitsDefault and isLogSourcesDefault are true if filter options match defaults', async () => {
    const onFiltersChanged = vi.fn()

    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    expect(result.current.isCommitsDefault).toBe(true)
    expect(result.current.isLogSourcesDefault).toBe(true)
  })

  it('onSelectCommits updates filters and URL when commits differ from default', async () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onSelectCommits([3, 4])
    })

    expect(onFiltersChanged).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.push).toHaveBeenCalledWith('/test-path?versions=3,4')
  })

  it('onSelectCommits removes param if commits return to default', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onSelectCommits([3, 4])
    })

    act(() => {
      result.current.onSelectCommits(ORIGINAL_COMMIT_IDS)
    })

    expect(onFiltersChanged).toHaveBeenCalledTimes(2)
    expect(mocks.push).toHaveBeenLastCalledWith('/test-path')
  })

  it('onSelectLogSources updates filters and URL when logSources differ from default', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onSelectLogSources([LogSources.Playground])
    })

    expect(onFiltersChanged).toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/test-path?origins=playground')
  })

  it('onSelectLogSources removes param if set to default', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onSelectLogSources([LogSources.Playground])
    })

    act(() => {
      result.current.onSelectLogSources(LOG_SOURCES)
    })

    expect(mocks.push).toHaveBeenCalledWith('/test-path')
  })

  it('onCreatedAtChange sets param when a date is provided', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    const fromDate = parseISO('2024-12-11T00:00:00+01:00')
    const toDate = parseISO('2024-12-11T23:59:59+01:00')

    act(() => {
      result.current.onCreatedAtChange({ from: fromDate, to: toDate })
    })

    expect(onFiltersChanged).toHaveBeenCalledWith(expect.any(Function))

    expect(mocks.push).toHaveBeenCalledWith(
      '/test-path?createdAt=2024-12-10T23:00:00Z,2024-12-11T23:59:59Z',
    )
  })

  it('onCreatedAtChange removes param if no date provided', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onCreatedAtChange(undefined)
    })

    expect(onFiltersChanged).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.push).toHaveBeenCalledWith('/test-path')
  })

  it('onCustomIdentifierChange sets param when a identifier is provided', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onCustomIdentifierChange('31')
    })

    expect(onFiltersChanged).toHaveBeenCalledWith(expect.any(Function))

    expect(mocks.push).toHaveBeenCalledWith('/test-path?customIdentifier=31')
  })

  it('onCustomIdentifierChange removes param if no identifier provided', () => {
    const onFiltersChanged = vi.fn()
    const { result } = renderHook(() =>
      useProcessLogFilters({
        onFiltersChanged,
        filterOptions: FILTER_OPTIONS,
        originalSelectedCommitsIds: ORIGINAL_COMMIT_IDS,
      }),
    )

    act(() => {
      result.current.onCustomIdentifierChange('')
    })

    expect(onFiltersChanged).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.push).toHaveBeenCalledWith('/test-path')
  })
})
