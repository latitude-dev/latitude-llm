'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { RealtimeToggle } from '$/components/RealtimeToggle'
import { useEvaluationResultsV2 } from '$/stores/evaluationResultsV2'
import { useEvaluationV2Stats } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/constants'
import {
  EvaluationResultsV2Search,
  evaluationResultsV2SearchToQueryParams,
} from '@latitude-data/core/helpers'
import { EvaluationResultV2WithDetails } from '@latitude-data/core/schema/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce, useDebouncedCallback } from 'use-debounce'
import { EvaluationTitle } from '../../_components/EvaluationTitle'
import { EvaluationActions } from './EvaluationActions'
import { EvaluationFilters } from './EvaluationFilters'
import { EvaluationResultsTable } from './EvaluationResults/Table'
import { EvaluationStats } from './EvaluationStats'

const useEvaluationResultsV2Socket = <
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  evaluation,
  search,
  mutate,
  refetchStats,
  realtimeEnabled,
}: {
  evaluation: EvaluationV2<T, M>
  search: EvaluationResultsV2Search
  mutate: ReturnType<typeof useEvaluationResultsV2<T, M>>['mutate']
  refetchStats: () => void
  realtimeEnabled: boolean
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultV2Created'>) => {
      if (!realtimeEnabled) return
      if (!args) return
      if (args.result.evaluationUuid !== evaluation.uuid) return
      const experimentIds = search.filters?.experimentIds
      if (experimentIds !== undefined) {
        if (experimentIds.length > 0) {
          if (!experimentIds.includes(args.result.experimentId ?? -1)) return
        } else if (args.result.experimentId) return
      }

      mutate(
        (prev) => [
          {
            ...args.result,
            commit: args.commit,
            dataset: args.dataset,
            evaluatedRow: args.datasetRow,
            evaluatedLog: args.providerLog,
            realtimeAdded: true,
          } as unknown as EvaluationResultV2WithDetails<T, M>,
          ...(prev ?? []),
        ],
        { revalidate: false },
      )

      setTimeout(() => {
        mutate(
          (prev) =>
            prev?.map((r) => {
              if (r.uuid === args.result.uuid) {
                return { ...r, realtimeAdded: undefined }
              }
              return r
            }),
          { revalidate: false },
        )
      }, 5000)

      refetchStats()
    },
    [evaluation, search, mutate, refetchStats, realtimeEnabled],
  )

  useSockets({ event: 'evaluationResultV2Created', onMessage })
}

function EvaluationScaleInfo<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ evaluation }: { evaluation: EvaluationV2<T, M> }) {
  const reverseScale = evaluation.configuration.reverseScale
  const icon = reverseScale ? 'arrowDown' : 'arrowUp'
  return (
    <span className='flex items-center gap-x-2 min-w-0'>
      <div className='flex gap-x-1 min-w-0'>
        <Text.H6 color='foregroundMuted' ellipsis noWrap>
          A {reverseScale ? 'lower' : 'higher'} score is better
        </Text.H6>
        <Icon name={icon} color='foregroundMuted' />
      </div>
    </span>
  )
}

export function EvaluationPage<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results: serverResults,
  selectedResult: serverSelectedResult,
  search: serverSearch,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  search: EvaluationResultsV2Search
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const [search, setSearch] = useState(serverSearch)
  useEffect(() => setSearch(serverSearch), [serverSearch])
  const [debouncedSearch] = useDebounce(search, 250)

  useEffect(() => {
    const currentUrl = window.location.origin + window.location.pathname
    const queryParams = evaluationResultsV2SearchToQueryParams(debouncedSearch)
    const targetUrl = `${currentUrl}?${queryParams}`
    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', targetUrl)
    }
  }, [debouncedSearch])

  const { data: results, mutate } = useEvaluationResultsV2<T, M>(
    { project, commit, document, evaluation, search: debouncedSearch },
    { fallbackData: serverResults, keepPreviousData: true },
  )

  // Note: prefetch next results
  useEvaluationResultsV2<T, M>({
    project: project,
    commit: commit,
    document: document,
    evaluation: evaluation,
    search: {
      ...debouncedSearch,
      pagination: {
        ...debouncedSearch.pagination,
        page: debouncedSearch.pagination.page + 1,
      },
    },
  })

  const [selectedResult, setSelectedResult] = useState(serverSelectedResult)

  const {
    data: stats,
    mutate: mutateStats,
    isLoading: isLoadingStats,
  } = useEvaluationV2Stats<T, M>({
    project: project,
    commit: commit,
    document: document,
    evaluation: evaluation,
    search: debouncedSearch,
  })
  const refetchStats = useDebouncedCallback(mutateStats, 1000)

  const [realtimeEnabled, setRealtimeEnabled] = useState(true)

  useEvaluationResultsV2Socket({
    evaluation: evaluation,
    search: search,
    mutate: mutate,
    refetchStats: refetchStats,
    realtimeEnabled: realtimeEnabled,
  })

  const openSettingsRef = useRef<() => void>(undefined)
  return (
    <div className='flex flex-grow min-h-0 flex-col w-full gap-4 p-6'>
      <TableWithHeader
        verticalAligment='bottom'
        title={<EvaluationTitle evaluation={evaluation} />}
        actions={<EvaluationActions openSettingsRef={openSettingsRef} />}
      />
      <div className='w-full flex items-end justify-between gap-x-2'>
        <EvaluationScaleInfo evaluation={evaluation} />
        <div className='flex items-center gap-4'>
          <EvaluationFilters search={search} setSearch={setSearch} />
          <RealtimeToggle
            enabled={realtimeEnabled}
            setEnabled={setRealtimeEnabled}
          />
        </div>
      </div>
      <EvaluationStats stats={stats} isLoading={isLoadingStats} />
      <EvaluationResultsTable
        results={results}
        selectedResult={selectedResult}
        setSelectedResult={setSelectedResult}
        search={search}
        setSearch={setSearch}
      />
    </div>
  )
}
