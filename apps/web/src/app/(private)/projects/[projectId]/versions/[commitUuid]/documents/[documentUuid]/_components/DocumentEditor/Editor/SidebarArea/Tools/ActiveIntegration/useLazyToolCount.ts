import { useEffect, useState } from 'react'
import { ActiveIntegration } from '../../toolsHelpers/types'
import { useSidebarStore } from '../../hooks/useSidebarStore'
import { CLIENT_TOOLS_INTEGRATION_NAME } from '../../toolsHelpers/collectTools'
import { ROUTES } from '$/services/routes'

/**
 * Lazily fetches tool names for an integration in the background
 * using requestIdleCallback to avoid blocking the UI render.
 * Only fetches when the browser is truly idle.
 */
export function useLazyToolCount(integration: ActiveIntegration) {
  const setIntegrationToolNames = useSidebarStore(
    (state) => state.setIntegrationToolNames,
  )
  const [isLoadingCount, setIsLoadingCount] = useState(false)
  const isClientTools = integration.name === CLIENT_TOOLS_INTEGRATION_NAME

  // Check if we need to fetch
  const needsFetch = !isClientTools && integration.allToolNames.length === 0

  useEffect(() => {
    if (!needsFetch) return

    let cancelled = false

    const fetchCallback = async () => {
      if (cancelled) return

      setIsLoadingCount(true)

      try {
        const url = ROUTES.api.integrations.detail(integration.name).listTools
          .root
        const response = await fetch(url)

        if (!response.ok) {
          setIsLoadingCount(false)
          return
        }

        const result = await response.json()

        if (cancelled) return

        // Handle the ToolResponse format from the API
        if (!result.ok) {
          console.error('Failed to fetch tools:', result.errorMessage)
          setIsLoadingCount(false)
          return
        }

        const toolNames = result.data.map((t: { name: string }) => t.name)

        // Update store in next frame to avoid batching issues
        requestAnimationFrame(() => {
          if (cancelled) return
          setIntegrationToolNames({
            integrationName: integration.name,
            toolNames,
          })
          setIsLoadingCount(false)
        })
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch tool count:', error)
          setIsLoadingCount(false)
        }
      }
    }

    // Use requestIdleCallback to defer the fetch until browser is idle
    let handle: number
    if ('requestIdleCallback' in window) {
      handle = window.requestIdleCallback(fetchCallback)
    } else {
      // Fallback to setTimeout for browsers without requestIdleCallback
      handle = setTimeout(fetchCallback, 1) as unknown as number
    }

    return () => {
      cancelled = true
      if ('cancelIdleCallback' in window) {
        window.cancelIdleCallback(handle)
      } else {
        clearTimeout(handle)
      }
    }
  }, [needsFetch, integration.name, setIntegrationToolNames])

  return {
    isLoadingCount,
    hasCount: integration.allToolNames.length > 0,
  }
}
