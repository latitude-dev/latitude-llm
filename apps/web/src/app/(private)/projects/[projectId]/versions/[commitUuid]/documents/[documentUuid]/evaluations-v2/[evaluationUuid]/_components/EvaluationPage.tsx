'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useCommits } from '$/stores/commitsStore'
import { useEvaluationResultsV2 } from '$/stores/evaluationResultsV2'
import { useEvaluationV2Stats } from '$/stores/evaluationsV2'
import {
  EvaluationMetric,
  EvaluationResultsV2Search,
  evaluationResultsV2SearchToQueryParams,
  EvaluationResultV2WithDetails,
  EvaluationType,
  EvaluationV2,
  EvaluationV2Stats,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
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
  mutate,
  refetchStats,
}: {
  evaluation: EvaluationV2<T, M>
  mutate: ReturnType<typeof useEvaluationResultsV2<T, M>>['mutate']
  refetchStats: () => void
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultV2Created'>) => {
      if (!args) return
      if (args.result.evaluationUuid !== evaluation.uuid) return

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
    [evaluation, mutate, refetchStats],
  )

  useSockets({ event: 'evaluationResultV2Created', onMessage })
}

function StatsInfo({ evaluation }: { evaluation: EvaluationV2 }) {
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
  stats: serverStats,
  search: serverSearch,
  refinementEnabled,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  stats?: EvaluationV2Stats
  search: EvaluationResultsV2Search
  refinementEnabled: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()
  const router = useRouter()
  const [search, setSearch] = useState(serverSearch)
  useEffect(() => setSearch(serverSearch), [serverSearch])
  const [debouncedSearch] = useDebounce(search, 500)
  useEffect(() => {
    const currentUrl = window.location.origin + window.location.pathname
    const queryParams = evaluationResultsV2SearchToQueryParams(debouncedSearch)
    const targetUrl = `${currentUrl}?${queryParams}`
    if (targetUrl !== window.location.href) {
      router.replace(targetUrl, { scroll: false })
    }
  }, [debouncedSearch, router])

  const { data: commits, isLoading: isLoadingCommits } = useCommits()

  const {
    data: results,
    mutate,
    isLoading: isLoadingResults,
  } = useEvaluationResultsV2<T, M>(
    { project, commit, document, evaluation, search: debouncedSearch },
    { fallbackData: serverResults },
  )

  const [selectedResult, setSelectedResult] = useState(serverSelectedResult)

  const {
    data: stats,
    mutate: mutateStats,
    isLoading: isLoadingStats,
  } = useEvaluationV2Stats<T, M>(
    { project, commit, document, evaluation, search: debouncedSearch },
    { fallbackData: serverStats },
  )
  const refetchStats = useDebouncedCallback(mutateStats, 1000)

  useEvaluationResultsV2Socket({ evaluation, mutate, refetchStats })

  const isLoading = isLoadingResults || isLoadingStats || isLoadingCommits

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full gap-4 p-6'>
      <TableWithHeader
        verticalAligment='bottom'
        title={<EvaluationTitle evaluation={evaluation} />}
        actions={<EvaluationActions />}
      />
      <div className='w-full flex items-end justify-between gap-x-2'>
        <StatsInfo evaluation={evaluation} />
        <EvaluationFilters
          commits={commits}
          search={search}
          setSearch={setSearch}
          isLoading={isLoading}
        />
      </div>
      <EvaluationStats stats={stats} isLoading={isLoading} />

      <EvaluationResultsTable
        results={results}
        selectedResult={selectedResult}
        setSelectedResult={setSelectedResult}
        search={search}
        setSearch={setSearch}
        refinementEnabled={refinementEnabled}
        isLoading={isLoading}
      />
    </div>
  )
}
