import { useCallback } from 'react'
import { KeyedMutator } from 'swr'
import { Commit, Project, DocumentTrigger } from '@latitude-data/core/browser'
import { useSockets } from '$/components/Providers/WebsocketsProvider/useSockets'

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
}
