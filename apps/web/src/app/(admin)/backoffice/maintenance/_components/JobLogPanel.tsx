'use client'

import { useEffect, useRef, useState } from 'react'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'

type LogEntry = {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'done'
  message: string
  data?: Record<string, unknown>
}

const LEVEL_VARIANT = {
  info: 'accent',
  warn: 'warningMuted',
  error: 'destructive',
  done: 'success',
} as const

export function JobLogPanel({
  jobId,
  onClose,
}: {
  jobId: string
  onClose: () => void
}) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [done, setDone] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = ROUTES.api.admin.maintenance.detail(jobId).logs
    const eventSource = new EventSource(url)

    eventSource.addEventListener('open', () => setConnected(true))

    eventSource.addEventListener('log', (e) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry
        setLogs((prev) => [...prev, entry])
      } catch {
        // ignore parse errors
      }
    })

    eventSource.addEventListener('done', (e) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry
        setLogs((prev) => [...prev, entry])
      } catch {
        // ignore parse errors
      }
      setDone(true)
      eventSource.close()
    })

    eventSource.addEventListener('error', () => {
      setConnected(false)
      eventSource.close()
    })

    return () => {
      eventSource.close()
    }
  }, [jobId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Card className='flex flex-col'>
      <div className='flex flex-row items-center justify-between p-4 border-b border-border'>
        <div className='flex flex-row items-center gap-3'>
          <Icon name='file' size='normal' color='primary' />
          <div className='flex flex-col'>
            <Text.H4>Job Logs</Text.H4>
            <Text.H6 color='foregroundMuted' monospace>
              {jobId}
            </Text.H6>
          </div>
          {!done && connected && (
            <div className='w-2 h-2 rounded-full bg-green-500 animate-pulse' />
          )}
          {done && (
            <Badge variant='success' size='small'>
              Completed
            </Badge>
          )}
          {!done && !connected && logs.length > 0 && (
            <Badge variant='destructive' size='small'>
              Disconnected
            </Badge>
          )}
        </div>
        <Button variant='ghost' size='small' onClick={onClose}>
          Close
        </Button>
      </div>
      <div
        ref={scrollRef}
        className='p-4 max-h-96 overflow-y-auto font-mono text-xs'
      >
        {logs.length === 0 && !done && (
          <Text.H6 color='foregroundMuted'>Waiting for log events...</Text.H6>
        )}
        {logs.map((entry, i) => (
          <div key={i} className='flex flex-row gap-2 py-0.5'>
            <Text.H6 color='foregroundMuted' monospace>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </Text.H6>
            <Badge variant={LEVEL_VARIANT[entry.level] ?? 'muted'} size='small'>
              {entry.level}
            </Badge>
            <Text.H6 monospace>{entry.message}</Text.H6>
            {entry.data && (
              <Text.H6 color='foregroundMuted' monospace>
                {JSON.stringify(entry.data)}
              </Text.H6>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
