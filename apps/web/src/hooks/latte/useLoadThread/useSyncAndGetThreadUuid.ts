import { useCallback } from 'react'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { Project } from '@latitude-data/core/browser'
import { StoredLatteDataByProject, useLatteStore } from '$/stores/latte/index'

/**
 * - If `threadUuid` exists and `storedThreadUuid` does not, set the local storage to `threadUuid`
 * - If both `threadUuid` and `storedThreadUuid` exist, update the local storage to `threadUuid`
 * - If `threadUuid` does not exist but `storedThreadUuid` does, set `threadUuid` to `storedThreadUuid`
 * - If neither `threadUuid` nor `storedThreadUuid` exist, do nothing
 **/
function findThread({
  threadUuid,
  storedThreadUuid,
}: {
  storedThreadUuid?: string
  threadUuid?: string
}) {
  if (threadUuid && !storedThreadUuid) return threadUuid
  if (threadUuid && storedThreadUuid) return threadUuid

  if (!threadUuid && storedThreadUuid) return storedThreadUuid

  return undefined
}

/**
 * Synchronizes the Latte thread UUID with local storage and returns the threadUuid to fetch.
 * Handles the logic of syncing between store state and localStorage for project-scoped threads.
 */
export function useSyncAndGetThreadUuid({ project }: { project: Project }) {
  const { threadUuid, setThreadUuid } = useLatteStore()
  const { value: storedLatteData } = useLocalStorage<StoredLatteDataByProject>({
    key: AppLocalStorage.latteThread,
    defaultValue: {},
  })

  const syncAndGetThreadUuid = useCallback(() => {
    const syncedThreadUUid = findThread({
      storedThreadUuid: storedLatteData[project.id]?.threadUuid,
      threadUuid,
    })

    setThreadUuid(syncedThreadUUid)

    return syncedThreadUUid
  }, [threadUuid, storedLatteData, project.id, setThreadUuid])

  return syncAndGetThreadUuid
}
