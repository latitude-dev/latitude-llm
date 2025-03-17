'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { EvaluationResultV2 } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsV2ByDocumentLogs(
  {
    documentLogUuids,
  }: {
    documentLogUuids: string[]
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.documentLogs.evaluationResultsV2.root
  const query = useMemo(() => {
    const query = new URLSearchParams()
    if (documentLogUuids.length) {
      query.set('documentLogUuids', [...new Set(documentLogUuids)].join(','))
    }
    return query.toString()
  }, [documentLogUuids])
  const fetcher = useFetcher(`${route}?${query}`)

  const { data = {}, ...rest } = useSWR<Record<string, EvaluationResultV2[]>>(
    compact(['evaluationResultsV2ByDocumentLogs', query]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
