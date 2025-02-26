'use client'

import { Badge } from '@latitude-data/web-ui'
import { useEffect, useState } from 'react'
import useMcpServers from '$/stores/mcpServers'
import { McpServer } from '@latitude-data/core/browser'

interface StatusCellProps {
  server: McpServer
}

// Map status to appropriate badge variant
const getStatusBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'deployed':
      return 'success'
    case 'deploying':
      return 'warningMuted'
    case 'pending':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'deleting':
      return 'warningMuted'
    case 'deleted':
      return 'muted'
    default:
      return 'muted'
  }
}

export default function StatusCell({ server }: StatusCellProps) {
  const { pollStatus } = useMcpServers()
  const [status, setStatus] = useState<string>(server.status || '-')

  useEffect(() => {
    setStatus(server.status || '-')

    // Set up polling interval
    const intervalId = setInterval(() => {
      pollStatus({ id: server.id })
        .then((result) => {
          if (result && typeof result === 'object' && 'status' in result) {
            const newStatus = result.status as string
            if (newStatus !== status) {
              setStatus(newStatus)
            }
          }
        })
        .catch((error) => {
          console.error('Error polling status:', error)
        })
    }, 5000) // Poll every 5 seconds

    // Clean up interval on unmount
    return () => clearInterval(intervalId)
  }, [server.id, pollStatus, status])

  return <Badge variant={getStatusBadgeVariant(status)}>{status || '-'}</Badge>
}
