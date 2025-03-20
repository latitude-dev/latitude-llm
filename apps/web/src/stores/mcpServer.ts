import { McpServer } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'
import { useState } from 'react'

export function useMcpServer(
  mcpServerId: string | null | undefined,
  swrConfig?: SWRConfiguration,
) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const { data, isLoading, isValidating, error } = useSWR<McpServer>(
    mcpServerId ? ['mcpServers', mcpServerId] : null,
    updateMcpServerStatus,
    swrConfig,
  )

  return {
    data,
    isLoading,
    isValidating,
    isUpdating,
    error,
    updateError,
  }

  async function updateMcpServerStatus() {
    if (!mcpServerId) return

    setIsUpdating(true)
    setUpdateError(null)

    try {
      const response = await fetch(`/api/mcpServers/${mcpServerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error(errorData)
        return
      }

      const updatedServer = await response.json()
      return updatedServer
    } catch (err) {
      setUpdateError(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      setIsUpdating(false)
    }
  }
}
