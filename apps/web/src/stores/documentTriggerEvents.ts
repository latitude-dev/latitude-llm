import { useCallback, useMemo } from 'react'
import useSWR, { mutate as globalMutate, SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/models/types/DocumentTriggerEvent'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'

function buildkey({
  projectId,
  commitUuid,
  triggerUuid,
}: {
  projectId: number
  commitUuid: string
  triggerUuid?: string
}) {
  return ['documentTriggerEvents', projectId, commitUuid, triggerUuid]
}
const EMPTY_ARRAY: DocumentTriggerEvent[] = []
export default function useDocumentTriggerEvents(
  {
    projectId,
    commitUuid,
    triggerUuid,
    onRealtimeTriggerEventCreated,
  }: {
    projectId: number
    commitUuid: string
    triggerUuid?: string
    onRealtimeTriggerEventCreated?(triggerEvent: DocumentTriggerEvent): void
  },
  { ...opts }: SWRConfiguration & {} = {},
) {
  const fetcher = useFetcher<DocumentTriggerEvent[]>(
    triggerUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .commits.detail(commitUuid)
          .triggers.detail(triggerUuid).triggerEvents.root
      : undefined,
  )

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<DocumentTriggerEvent[]>(
    buildkey({ projectId, commitUuid, triggerUuid }),
    fetcher,
    opts,
  )

  useSockets({
    event: 'triggerEventCreated',
    onMessage: (payload) => {
      // Datadog: "Right side of assignment cannot be destructured"
      // Socket payload can be undefined/null (or missing triggerEvent).
      const triggerEvent = payload?.triggerEvent
      if (!triggerEvent) return

      // If this hook is scoped to a specific trigger, only accept events for it.
      if (triggerUuid && triggerEvent.triggerUuid !== triggerUuid) return

      onRealtimeTriggerEventCreated?.(triggerEvent)
      mutate((prev) => [triggerEvent, ...(prev ?? [])], {
        revalidate: false,
      })
    },
  })

  const onDocumentTriggerEventCreated = useCallback(
    (event: { triggerEvent: DocumentTriggerEvent; commit: Commit }) => {
      if (event.commit.uuid !== commitUuid) return

      // optimistic update, don't revalidate
      const key = buildkey({
        projectId,
        commitUuid,
        triggerUuid: event.triggerEvent.triggerUuid,
      })
      onRealtimeTriggerEventCreated?.(event.triggerEvent)
      globalMutate<DocumentTriggerEvent[]>(
        key,
        (prev = []) => {
          const triggerEvent = event.triggerEvent
          const existingEvent = prev.find((t) => t.id === triggerEvent.id)
          if (existingEvent) return prev

          return [triggerEvent, ...prev]
        },
        false, // don't revalidate. we'll get the real data from the socket anyway
      )
    },
    [projectId, commitUuid, onRealtimeTriggerEventCreated],
  )

  return useMemo(
    () => ({
      data,
      isLoading,
      onDocumentTriggerEventCreated,
    }),
    [data, isLoading, onDocumentTriggerEventCreated],
  )
}
