import { ReactNode, useMemo } from 'react'

import type { DocumentLogWithMetadata } from '@latitude-data/core'
import { ProviderLog } from '@latitude-data/core/browser'
import {
  ClickToCopy,
  Icons,
  Skeleton,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { format } from 'date-fns'

import { formatCost, formatDuration } from '../utils'

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
        <Skeleton className='w-12 h-4 bg-muted-foreground/10' />
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
  const { data: providers, isLoading: providersLoading } = useProviderApiKeys()
  const lastProviderLog = useMemo(
    () => providerLogs?.[providerLogs.length - 1],
    [providerLogs],
  )

  const tokensByModel = useMemo(
    () =>
      providerLogs?.reduce(
        (acc, log) => {
          acc[log.model!] = (acc[log.model!] ?? 0) + log.tokens
          return acc
        },
        {} as Record<string, number>,
      ) ?? {},
    [providerLogs],
  )

  const costByModel = useMemo(
    () =>
      providerLogs?.reduce(
        (acc, log) => {
          const key = String(log.providerId)
          acc[key] = (acc[key] ?? 0) + log.cost
          return acc
        },
        {} as Record<string, number>,
      ) ?? {},
    [providerLogs],
  )

  return (
    <div className='flex flex-col gap-6 py-6 w-full'>
      <MetadataItem label='Log uuid'>
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
      <MetadataItem label='Tokens' loading={!lastProviderLog}>
        <Tooltip
          side='bottom'
          align='end'
          delayDuration={250}
          trigger={
            <div className='flex flex-row items-center gap-x-1'>
              <Text.H5 color='foregroundMuted'>{documentLog.tokens}</Text.H5>
              <Icons.info className='w-4 h-4 text-muted-foreground' />
            </div>
          }
        >
          <div className='flex flex-col justify-between'>
            {Object.entries(tokensByModel).map(([model, tokens]) => (
              <div key={model} className='flex flex-row items-center gap-4'>
                <Text.H6B color='white'>{model}</Text.H6B>
                <Text.H6 color='white'>{tokens}</Text.H6>
              </div>
            ))}
          </div>
        </Tooltip>
      </MetadataItem>
      <MetadataItem label='Cost' loading={!lastProviderLog || providersLoading}>
        <Tooltip
          side='bottom'
          align='end'
          delayDuration={250}
          trigger={
            <div className='flex flex-row items-center gap-x-1'>
              <Text.H5 color='foregroundMuted'>
                {formatCost(documentLog.cost ?? 0)}
              </Text.H5>
              <Icons.info className='w-4 h-4 text-muted-foreground' />
            </div>
          }
        >
          <div className='flex flex-col justify-between'>
            {Object.entries(costByModel).map(([providerId, cost]) => (
              <div
                key={providerId}
                className='flex flex-row items-center gap-4'
              >
                <Text.H6B color='white'>
                  {providers?.find((p) => p.id === Number(providerId))?.name ??
                    'Unknown'}
                </Text.H6B>
                <Text.H6 color='white'>{formatCost(cost)}</Text.H6>
              </div>
            ))}
          </div>
        </Tooltip>
      </MetadataItem>
      <MetadataItem
        label='Duration'
        value={formatDuration(documentLog.duration)}
      />
      {(providerLogs?.length ?? 0) > 0 && (
        <MetadataItem
          label='Time until last message'
          value={formatDuration(
            documentLog.duration - (lastProviderLog?.duration ?? 0),
          )}
          loading={!lastProviderLog}
        />
      )}
      <MetadataItem label='Version'>
        <ClickToCopy copyValue={documentLog.commit.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {documentLog.commit.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
    </div>
  )
}
