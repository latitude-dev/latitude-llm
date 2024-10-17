'use client'

import type { DocumentVersion, Evaluation } from '@latitude-data/core/browser'
import { useSession } from '@latitude-data/web-ui'
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
  const { workspace } = useSession()
  const fetcher = useFetcher(
    ROUTES.api.evaluations.detail(evaluation.id).connectedDocuments.root,
  )

  const {
    data = [],
    isLoading,
    error,
  } = useSWR<DocumentVersion[]>(
    ['connectedDocuments', workspace.id, evaluation.id],
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    error,
  }
}
