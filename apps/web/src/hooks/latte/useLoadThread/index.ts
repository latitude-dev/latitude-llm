import { useEffect, useTransition, useRef } from 'react'
import { useLatteStore } from '$/stores/latte/index'

import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { fetchProviderLogHydrated } from './fetchProviderLogHydrated'
import { buildInteractionsFromProviderLog } from './buildInteractionsFromProviderLog'
import { useSyncAndGetThreadUuid } from './useSyncAndGetThreadUuid'

/**
 * - Loads and transforms provider logs into Latte interactions.
 * - Fetches provider logs for the current thread UUID and converts them
 *   into a structured format of user-assistant interactions with input/output pairs.
 * - Runs only if there are no interactions in the current chat state,
 *   so it avoids overriding existing state.
 * - Runs once when Chat loads for a given project.
 */
export function useLoadThread() {
  const { project } = useCurrentProject()
  const projectId = project.id

  const lastLoadedProjectId = useRef<number | null>(null)
  const { interactions, setInteractions, currentProjectId, setCurrentProject } =
    useLatteStore()
  const syncAndGetThreadUuid = useSyncAndGetThreadUuid({ project })
  const [isLoading, startTransition] = useTransition()

  if (currentProjectId !== projectId) {
    setCurrentProject(projectId)
    lastLoadedProjectId.current = null // force a reload next time
  }

  useEffect(() => {
    // Don’t refetch if there are already interactions
    if (interactions.length > 0) return

    // Don’t refetch if we already fetched this project
    if (lastLoadedProjectId.current === projectId) return

    lastLoadedProjectId.current = projectId

    startTransition(async () => {
      const threadUuid = syncAndGetThreadUuid()
      if (!threadUuid) return

      const providerLog = await fetchProviderLogHydrated({ threadUuid })
      if (!providerLog) return

      const _interactions = buildInteractionsFromProviderLog({ providerLog })
      if (_interactions.length > 0) {
        setInteractions(_interactions)
      }
    })
  }, [projectId, interactions.length, syncAndGetThreadUuid, setInteractions])

  return isLoading
}
