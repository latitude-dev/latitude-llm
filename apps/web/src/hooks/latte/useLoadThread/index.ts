import { useEffect, useRef } from 'react'
import { useLatteStore } from '$/stores/latte/index'

import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { buildInteractionsFromProviderLog } from './buildInteractionsFromProviderLog'
import type { ProviderLogDto } from '@latitude-data/core/browser'

/**
 * Hook to load and initialize a thread in the Latte store based on the current project.
 * It sets the thread UUID and builds interactions from the initial provider log if provided.
 * @param initialThreadUuid - Optional UUID of the thread to load
 * @param initialProviderLog - Optional provider log to build interactions from
 * @returns Always returns false (placeholder for future loading state)
 */
export function useLoadThread({
  initialThreadUuid,
  initialProviderLog,
}: {
  initialThreadUuid?: string
  initialProviderLog?: ProviderLogDto
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

    if (initialProviderLog && interactions.length === 0) {
      const built = buildInteractionsFromProviderLog({
        providerLog: initialProviderLog,
      })
      if (built.length > 0) setInteractions(built)
    }
  }, [
    projectId,
    initialThreadUuid,
    initialProviderLog,
    setThreadUuid,
    interactions.length,
    setInteractions,
  ])

  return false
}
