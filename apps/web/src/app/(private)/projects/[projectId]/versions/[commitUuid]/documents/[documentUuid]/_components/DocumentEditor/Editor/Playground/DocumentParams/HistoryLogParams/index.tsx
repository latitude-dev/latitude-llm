import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { Badge, cn, Icon, Skeleton, Text, Tooltip } from '@latitude-data/web-ui'
import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'
import { useGenerateDocumentLogDetailUrl } from '$/hooks/useGenerateDocumentLogDetailUrl'
import { format } from 'date-fns'
import Link from 'next/link'

import { InputParams } from '../Input'
import { ParametersPaginationNav } from '../PaginationNav'
import { useLogHistoryParams } from './useLogHistoryParams'

function usePaginatedDocumentLogUrl({
  page,
  selectedLog,
  isLoading,
}: {
  selectedLog: DocumentLogWithMetadataAndError | undefined
  page: number | undefined
  isLoading: boolean
}) {
  const uuid = selectedLog?.uuid
  const { url } = useGenerateDocumentLogDetailUrl({
    page,
    documentLogUuid: uuid,
  })

  if (isLoading || !uuid || !url) return undefined

  const shortCode = uuid.split('-')[0]
  const createdAt = format(selectedLog.createdAt, 'PPp')
  return {
    url,
    shortCode,
    createdAt,
    hasError: !!selectedLog.error.message,
  }
}

export function HistoryLogParams({
  inputs,
  setInput,
  setInputs,
}: {
  inputs: PlaygroundInputs
  setInput: (param: string, value: PlaygroundInput) => void
  setInputs: (newInputs: PlaygroundInputs) => void
}) {
  const data = useLogHistoryParams({ inputs, setInputs })
  const urlData = usePaginatedDocumentLogUrl({
    selectedLog: data.selectedLog,
    page: data.page,
    isLoading: data.isLoadingLog,
  })
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-2'>
        <div className='flex-grow'>
          {data.isLoadingLog ? (
            <div className='flex flex-row gap-x-2 w-full'>
              <Skeleton height='h3' className='w-2/3' />
              <Skeleton height='h3' className='w-1/3' />
            </div>
          ) : null}
          {!data.isLoadingLog && urlData ? (
            <Link href={urlData.url}>
              <div className='flex flex-row items-center gap-x-2'>
                <Text.H5>{urlData.createdAt}</Text.H5>
                {urlData.hasError ? (
                  <Tooltip
                    variant='destructive'
                    trigger={
                      <Badge variant='destructive'>{urlData.shortCode}</Badge>
                    }
                  >
                    This log has an error
                  </Tooltip>
                ) : (
                  <Badge variant='accent'>{urlData.shortCode}</Badge>
                )}
                <Icon name='externalLink' color='foregroundMuted' />
              </div>
            </Link>
          ) : null}
        </div>
        <div>
          <ParametersPaginationNav
            disabled={data.isLoadingLog}
            label='history logs'
            currentIndex={data.position}
            totalCount={data.count}
            onPrevPage={data.onPrevPage}
            onNextPage={data.onNextPage}
          />
        </div>
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <InputParams inputs={inputs} setInput={setInput} />
      </div>
    </div>
  )
}
