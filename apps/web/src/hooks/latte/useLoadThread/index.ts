import { useEffect, useRef } from 'react'
import { useLatteStore } from '$/stores/latte/index'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { buildInteractionsFromMessages } from './buildInteractionsFromMessages'
import type { Message } from '@latitude-data/constants/messages'

export function useLoadThread({
  initialThreadUuid,
  initialMessages,
}: {
  initialThreadUuid?: string
  initialMessages?: Message[]
}) {
  const { project } = useCurrentProject()
  const projectId = project.id

  const lastLoadedProjectId = useRef<number | null>(null)
  const {
    interactions,
    setInteractions,
    setThreadUuid,
    currentProjectId,
    setCurrentProject,
  } = useLatteStore()

  useEffect(() => {
    if (currentProjectId !== projectId) {
      setCurrentProject(projectId)
      lastLoadedProjectId.current = null
    }
  }, [currentProjectId, projectId, setCurrentProject])

  useEffect(() => {
    if (lastLoadedProjectId.current === projectId) return
    lastLoadedProjectId.current = projectId

    if (initialThreadUuid) setThreadUuid(initialThreadUuid)

    if (
      initialMessages &&
      initialMessages.length > 0 &&
      interactions.length === 0
    ) {
      const built = buildInteractionsFromMessages(initialMessages)
      if (built.length > 0) setInteractions(built)
    }
  }, [
    projectId,
    initialThreadUuid,
    initialMessages,
    setThreadUuid,
    interactions.length,
    setInteractions,
  ])

  return false
}
