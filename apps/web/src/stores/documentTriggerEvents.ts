import { useMemo } from 'react'
import useSWR, { type SWRConfiguration } from 'swr'
import type { DocumentTriggerEvent } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

const EMPTY_ARRAY: DocumentTriggerEvent[] = []
export default function useDocumentTriggerEvents(
  {
    projectId,
    commitUuid,
    triggerUuid,
  }: { projectId: number; commitUuid: string; triggerUuid: string },
  { ...opts }: SWRConfiguration & {} = {},
) {
  const fetcher = useFetcher<DocumentTriggerEvent[]>(
    ROUTES.api.projects.detail(projectId).commits.detail(commitUuid).triggers.detail(triggerUuid)
      .triggerEvents.root,
  )

  const { data = EMPTY_ARRAY, isLoading } = useSWR<DocumentTriggerEvent[]>(
    ['documentTriggerEvents', projectId, commitUuid, triggerUuid],
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      isLoading,
    }),
    [data, isLoading],
  )
}
