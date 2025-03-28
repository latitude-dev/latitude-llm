'use client'

import { compact } from 'lodash-es'

import { ResultWithEvaluation } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsByDocumentLogs(
  {
    documentLogIds,
  }: {
    documentLogIds: number[]
  },
  opts?: SWRConfiguration,
) {
  // With thousands of ids, this could generate a URL so big that could
  // generate a problem. But we are not using this for that many ids.
  const route = ROUTES.api.documentLogs.evaluationResults.root
  const query = `ids=${[...new Set(documentLogIds)].join(',')}`
  const fetcher = useFetcher<Record<number, ResultWithEvaluation[]>>(
    `${route}?${query}`,
  )

  const { data = {}, ...rest } = useSWR<Record<number, ResultWithEvaluation[]>>(
    compact(['evaluationResultsByDocumentLogs', query]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
