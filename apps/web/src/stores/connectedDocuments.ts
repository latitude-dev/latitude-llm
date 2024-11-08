'use client'

import type { DocumentVersion, Evaluation } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useConnectedDocuments(
  {
    evaluation,
  }: {
    evaluation: Evaluation
  },
  opts: SWRConfiguration = {},
) {
  const fetcher = useFetcher(
    ROUTES.api.evaluations.detail(evaluation.id).connectedDocuments.root,
  )

  const {
    data = [],
    isLoading,
    error,
  } = useSWR<DocumentVersion[]>(
    ['connectedDocuments', evaluation.id],
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    error,
  }
}
