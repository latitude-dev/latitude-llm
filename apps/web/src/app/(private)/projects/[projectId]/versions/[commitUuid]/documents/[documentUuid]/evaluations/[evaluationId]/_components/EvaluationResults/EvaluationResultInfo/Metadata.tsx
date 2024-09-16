import { ReactNode } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  ClickToCopy,
  Icon,
  Skeleton,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { format } from 'date-fns'

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

export function EvaluationResultMetadata({
  evaluationResult,
  providerLog,
}: {
  evaluationResult: EvaluationResultWithMetadata
  providerLog?: ProviderLogDto
}) {
  const { data: providers, isLoading: providersLoading } = useProviderApiKeys()

  return (
    <div className='flex flex-col gap-6 py-6 w-full'>
      <MetadataItem label='Result id'>
        <ClickToCopy copyValue={evaluationResult.id.toString()}>
          <Text.H5 align='right' color='foregroundMuted'>
            {evaluationResult.id}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      <MetadataItem
        label='Timestamp'
        value={format(evaluationResult.createdAt, 'PPp')}
      />
      <MetadataItem
        label='Tokens'
        loading={!providerLog}
        value={providerLog?.tokens.toString()}
      />
      <MetadataItem
        label='Model'
        loading={!providerLog}
        value={providerLog?.model ?? 'Unknown'}
      />
      <MetadataItem
        label='Provider'
        loading={!providerLog}
        value={
          providers.find((p) => p.id === providerLog?.providerId)?.name ??
          'Unknown'
        }
      />
      <MetadataItem label='Cost' loading={!providerLog || providersLoading}>
        <Tooltip
          side='bottom'
          align='end'
          delayDuration={250}
          trigger={
            <div className='flex flex-row items-center gap-x-1'>
              <Text.H5 color='foregroundMuted'>
                {formatCostInMillicents(evaluationResult.costInMillicents ?? 0)}
              </Text.H5>
              <Icon name='info' className='text-muted-foreground' />
            </div>
          }
        >
          <div className='flex flex-col justify-between'>
            <Text.H6 color='background'>
              Note: This is just an estimate based on the token usage and your
              provider's pricing. Actual cost may vary.
            </Text.H6>
          </div>
        </Tooltip>
      </MetadataItem>
      <MetadataItem label='Version'>
        <ClickToCopy copyValue={evaluationResult.commit.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {evaluationResult.commit.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
    </div>
  )
}
