import { create } from 'zustand'
import { useCallback } from 'react'
import { KeyedMutator } from 'swr'
import {
  Commit,
  Project,
  DocumentTrigger,
  DocumentTriggerEvent,
} from '@latitude-data/core/browser'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'
import useDocumentTriggerEvents from '$/stores/documentTriggerEvents'

type RealtimeTriggerEventCounters = {
  eventsByTrigger: Record<string, number | undefined>
  resetCounter: (triggerUuid: string) => void
  incrementCounter: (triggerUuid: string) => void
}
export const realtimeTriggerEventsCounters =
  create<RealtimeTriggerEventCounters>((set) => ({
    eventsByTrigger: {},
    resetCounter: (triggerUuid: string) =>
      set((state) => ({
        eventsByTrigger: { ...state.eventsByTrigger, [triggerUuid]: undefined },
      })),
    incrementCounter: (triggerUuid: string) =>
      set((state) => ({
        eventsByTrigger: {
          ...state.eventsByTrigger,
          [triggerUuid]: (state.eventsByTrigger[triggerUuid] || 0) + 1,
        },
      })),
  }))

/**
 * Real-time updates for document triggers using websockets.
 */
export function useTriggerSockets({
  commit,
  project,
  mutate,
}: {
  commit: Commit
  project: Project
  mutate: KeyedMutator<DocumentTrigger[]>
}) {
  const { incrementCounter } = realtimeTriggerEventsCounters((state) => ({
    incrementCounter: state.incrementCounter,
  }))
  const onRealtimeTriggerEventCreated = useCallback(
    (event: DocumentTriggerEvent) => {
      incrementCounter(event.triggerUuid)
    },
    [incrementCounter],
  )
  const { onDocumentTriggerEventCreated } = useDocumentTriggerEvents({
    projectId: project.id,
    commitUuid: commit.uuid,
    onRealtimeTriggerEventCreated,
  })

  const onTriggerCreated = useCallback(
    (event: { workspaceId: number; trigger: DocumentTrigger }) => {
      const projectId = event.trigger.projectId
      const commitId = event.trigger.commitId
      if (projectId !== project.id || commitId !== commit.id) return

      mutate(
        (prevTriggers) => {
          if (!prevTriggers) return [event.trigger]
          const triggerPresent = prevTriggers.find(
            (t) => t.uuid === event.trigger.uuid,
          )

          if (triggerPresent) return prevTriggers

          return [event.trigger, ...prevTriggers]
        },
        { revalidate: false },
      )
    },
    [project.id, commit.id, mutate],
  )

  const onTriggerDeleted = useCallback(
    (event: { workspaceId: number; trigger: DocumentTrigger }) => {
      const projectId = event.trigger.projectId
      const commitId = event.trigger.commitId
      if (projectId !== project.id || commitId !== commit.id) return

      mutate(
        (prevTriggers) => {
          if (!prevTriggers) return prevTriggers

          return prevTriggers.filter((t) => t.uuid !== event.trigger.uuid)
        },
        { revalidate: false },
      )
    },
    [project.id, commit.id, mutate],
  )

  useSockets({ event: 'triggerCreated', onMessage: onTriggerCreated })
  useSockets({ event: 'triggerDeleted', onMessage: onTriggerDeleted })
  useSockets({
    event: 'triggerEventCreated',
    onMessage: onDocumentTriggerEventCreated,
  })
}
