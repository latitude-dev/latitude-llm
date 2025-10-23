import { create } from 'zustand'
import { IssuesServerResponse } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/page'
import {
  DEFAULTS_ISSUE_PARAMS,
  IssuesFiltersQueryParamsInput,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import { convertIssuesParamsToQueryParams } from '@latitude-data/constants/issues'

type IssuesParametersState = {
  limit: number
  totalCount: number
  page: number
  hasPrevPage: boolean
  hasNextPage: boolean
  filters: SafeIssuesParams['filters']
  sorting: SafeIssuesParams['sorting']
  urlParameters: Partial<IssuesFiltersQueryParamsInput> | undefined
}

type SafeFilterUpdate = Partial<{
  [K in keyof SafeIssuesParams['filters']]:
    | SafeIssuesParams['filters'][K]
    | undefined
}>

type IssuesParameters = IssuesParametersState & {
  init: (_args: {
    params: SafeIssuesParams & { totalCount: number }
    onStateChange: (queryParams: Partial<IssuesFiltersQueryParamsInput>) => void
  }) => void
  setFilters: (filters: SafeFilterUpdate) => void
  setSorting: (sorting: Partial<SafeIssuesParams['sorting']>) => void
  setLimit: (limit: number) => void
  onSuccessIssuesFetch: (data: IssuesServerResponse | void) => void
  nextPage: () => void
  prevPage: () => void
  onStateChange: (queryParams: Partial<IssuesFiltersQueryParamsInput>) => void
  resetFilters: () => void
  resetSorting: () => void
}

/**
 * Derives computed state values like URL parameters and pagination booleans.
 */
function deriveState({
  state,
  onParametersChange,
}: {
  state: Omit<
    IssuesParametersState,
    'urlParameters' | 'hasPrevPage' | 'hasNextPage'
  >
  onParametersChange?: (
    queryParams: Partial<IssuesFiltersQueryParamsInput>,
  ) => void
}) {
  const { page, limit, totalCount } = state

  const hasPrevPage = page > 1
  const hasNextPage = page * limit < totalCount

  const urlParameters = convertIssuesParamsToQueryParams({
    page,
    limit,
    filters: state.filters,
    sorting: state.sorting,
  })

  onParametersChange?.(urlParameters)

  return {
    ...state,
    hasPrevPage,
    hasNextPage,
    urlParameters,
  } satisfies IssuesParametersState
}

export const useIssuesParameters = create<IssuesParameters>((set, get) => ({
  init: ({ params, onStateChange }) => {
    set({
      ...deriveState({
        state: {
          page: params.page,
          totalCount: params.totalCount,
          limit: params.limit,
          filters: params.filters,
          sorting: params.sorting,
        },
      }),
      onStateChange,
    })
  },
  page: 1,
  totalCount: 0,
  limit: DEFAULTS_ISSUE_PARAMS.limit,
  filters: {},
  sorting: DEFAULTS_ISSUE_PARAMS.sorting,
  hasPrevPage: false,
  hasNextPage: false,
  urlParameters: undefined,
  onStateChange: (_p) => {},

  setFilters: (filters) => {
    const state = get()
    set(
      deriveState({
        state: {
          ...state,
          filters: { ...state.filters, ...filters },
          page: 1,
        },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  setSorting: (sorting) => {
    const state = get()
    set(
      deriveState({
        state: {
          ...state,
          sorting: { ...state.sorting, ...sorting },
        },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  setLimit: (limit) => {
    const state = get()
    set(
      deriveState({
        state: { ...state, limit },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  resetFilters: () => {
    const state = get()
    set(
      deriveState({
        state: { ...state, filters: {} },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  resetSorting: () => {
    const state = get()
    set(
      deriveState({
        state: { ...state, sorting: DEFAULTS_ISSUE_PARAMS.sorting },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  nextPage: () => {
    const state = get()
    if (state.page * state.limit >= state.totalCount) return

    const newPage = state.page + 1
    set(
      deriveState({
        state: {
          ...state,
          page: newPage,
        },
        onParametersChange: state.onStateChange,
      }),
    )
  },

  prevPage: () => {
    const state = get()
    if (state.page <= 1) return

    const newPage = Math.max(1, state.page - 1)
    set(
      deriveState({
        state: {
          ...state,
          page: newPage,
        },
        onParametersChange: state.onStateChange,
      }),
    )
  },
  onSuccessIssuesFetch: (data) => {
    if (!data) return

    const state = get()
    set(
      deriveState({
        state: { ...state, totalCount: data.totalCount },
        onParametersChange: state.onStateChange,
      }),
    )
  },
}))
