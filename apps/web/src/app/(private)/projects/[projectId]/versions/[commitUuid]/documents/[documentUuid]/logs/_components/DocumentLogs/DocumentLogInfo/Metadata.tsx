import { ReactNode, useMemo } from 'react'

import type { DocumentLogWithMetadata } from '@latitude-data/core'
import { ProviderLog } from '@latitude-data/core/browser'
import { ClickToCopy, Skeleton, Text } from '@latitude-data/web-ui'
import { format } from 'date-fns'

import { formatDuration } from '../utils'

function MetadataItem({
  label,
  value,
  loading,
  children,
}: {
  label: string
  value?: string
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <div className='flex flex-row justify-between items-center gap-2'>
      <Text.H5M color='foreground'>{label}</Text.H5M>
      {loading ? (
        <Skeleton className='w-12 h-4' />
      ) : (
        <>
          {value && (
            <Text.H5 align='right' color='foregroundMuted'>
              {value}
            </Text.H5>
          )}
          {children}
        </>
      )}
    </div>
  )
}

export function DocumentLogMetadata({
  documentLog,
  providerLogs,
}: {
  documentLog: DocumentLogWithMetadata
  providerLogs?: ProviderLog[]
}) {
  const lastProviderLog = useMemo(
    () => providerLogs?.[providerLogs.length - 1],
    [providerLogs],
  )

  return (
    <div className='flex flex-col gap-6 py-6 w-full'>
      <MetadataItem label='uuid'>
        <ClickToCopy copyValue={documentLog.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {documentLog.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      <MetadataItem
        label='Timestamp'
        value={format(documentLog.createdAt, 'PPp')}
      />
      <MetadataItem
        label='Duration'
        value={formatDuration(documentLog.duration)}
      />
      <MetadataItem
        label='Time to first token'
        value={formatDuration(
          documentLog.duration - (lastProviderLog?.duration ?? 0),
        )}
        loading={!lastProviderLog}
      />
    </div>
  )
}
