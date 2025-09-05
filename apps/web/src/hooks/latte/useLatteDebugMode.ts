'use client'

import { ROUTES } from '$/services/routes'
import { useCurrentUser } from '$/stores/currentUser'
import { useLatteStore } from '$/stores/latte'
import useFeature from '$/stores/useFeature'
import { LatteVersion } from '@latitude-data/core/services/copilot/latte/debugVersions'
import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import useFetcher from '../useFetcher'

const EMPTY_ARRAY = [] as const

/**
 * Handles debug data
 */
export function useLatteDebugMode() {
  const { debugVersionUuid, setDebugVersionUuid } = useLatteStore()
  const { isEnabled: debugModeEnabled, isLoading: isLoadingFeatureFlag } =
    useFeature('latteDebugMode')
  const { data: user, isLoading: isLoadingUser } = useCurrentUser()

  const enabled = debugModeEnabled && user?.admin

  const fetcher = useFetcher<LatteVersion[]>(
    enabled ? ROUTES.api.latte.debug.versions.root : undefined,
  )

  const { data = EMPTY_ARRAY, isLoading: isLoadingLatteDebugVersions } = useSWR<
    LatteVersion[]
  >(['latteDebugVersions'], fetcher)

  const isLoading =
    isLoadingUser || isLoadingFeatureFlag || isLoadingLatteDebugVersions

  const selectedVersionUuid = useMemo(() => {
    if (!enabled) return undefined
    if (!data) return debugVersionUuid

    if (data.some((version) => version.uuid == debugVersionUuid)) {
      return debugVersionUuid
    }

    return data.find((version) => version.isLive)?.uuid
  }, [enabled, debugVersionUuid, data])

  useEffect(() => {
    // When the list of versions has loaded, if the selected debugVersionUuid is not on the list, automatically unset it
    if (isLoading) return
    if (!debugVersionUuid) return

    if (data.some((version) => version.uuid === debugVersionUuid)) {
      return
    }

    setDebugVersionUuid(undefined)
  }, [isLoading, debugVersionUuid, data, setDebugVersionUuid])

  return useMemo(
    () => ({
      enabled,
      data,
      isLoading,
      selectedVersionUuid,
      setSelectedVersionUuid: setDebugVersionUuid,
    }),
    [enabled, data, selectedVersionUuid, isLoading, setDebugVersionUuid],
  )
}
