import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useGenerateDocumentLogDetailUrl } from '$/hooks/useGenerateDocumentLogDetailUrl'
import { DocumentLog, DocumentVersion } from '@latitude-data/core/browser'
import {
  Badge,
  ClientOnly,
  cn,
  Icon,
  Skeleton,
  Text,
  TextArea,
  Tooltip,
  type ICommitContextType,
} from '@latitude-data/web-ui'
import { format } from 'date-fns'
import Link from 'next/link'

import { ParametersPaginationNav } from '../PaginationNav'
import { type UseLogHistoryParams } from './useLogHistoryParams'
import {
  asPromptLFile,
  PromptLFileParameter,
} from '$/components/PromptLFileParameter'

function usePaginatedDocumentLogUrl({
  page,
  selectedLog,
  isLoading,
}: {
  selectedLog: DocumentLog | undefined
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
  }
}

export function HistoryLogParams({
  data,
  commit,
  document,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  data: UseLogHistoryParams
}) {
  const {
    history: { inputs, setInput },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const urlData = usePaginatedDocumentLogUrl({
    selectedLog: data.selectedLog,
    page: data.page,
    isLoading: data.isLoadingLog,
  })

  const hasLogs = data.count > 0

  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4'>
        {data.isLoading || hasLogs ? (
          <>
            <div className='flex flex-grow min-w-0'>
              {data.isLoadingLog ? (
                <div className='flex flex-row gap-x-2 w-full'>
                  <Skeleton height='h3' className='w-2/3' />
                  <Skeleton height='h3' className='w-1/3' />
                </div>
              ) : null}
              {!data.isLoadingLog && urlData ? (
                <Link
                  href={urlData.url}
                  className='flex-grow min-w-0 flex flex-row items-center gap-x-2'
                >
                  <Text.H5 ellipsis noWrap>
                    {urlData.createdAt}
                  </Text.H5>
                  <Badge variant='accent'>{urlData.shortCode}</Badge>
                  <Icon
                    name='externalLink'
                    color='foregroundMuted'
                    className='flex-none'
                  />
                </Link>
              ) : null}
            </div>
            <ParametersPaginationNav
              disabled={data.isLoadingLog}
              label='history logs'
              currentIndex={data.position}
              totalCount={data.count}
              onPrevPage={data.onPrevPage}
              onNextPage={data.onNextPage}
            />
          </>
        ) : (
          <div className='w-full flex justify-center'>
            <Text.H5>No logs found</Text.H5>
          </div>
        )}
      </div>
      <div className={cn({ 'opacity-50': data.isLoading })}>
        <ClientOnly>
          <div className='flex flex-col gap-3'>
            {Object.keys(inputs).length > 0 ? (
              <div className='grid grid-cols-[auto_1fr] gap-y-3'>
                {Object.entries(inputs).map(([param, input], idx) => {
                  const includedInPrompt =
                    input.metadata.includeInPrompt ?? true

                  const file = asPromptLFile(input.value)

                  return (
                    <div
                      className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                      key={idx}
                    >
                      <div className='flex flex-row items-center gap-x-2 min-h-8'>
                        <Badge variant={includedInPrompt ? 'accent' : 'muted'}>
                          &#123;&#123;{param}&#125;&#125;
                        </Badge>
                        {!includedInPrompt && (
                          <Tooltip trigger={<Icon name='info' />}>
                            This variable is not included in the current prompt
                          </Tooltip>
                        )}
                      </div>
                      <div className='flex flex-grow w-full min-w-0'>
                        {file ? (
                          <PromptLFileParameter file={file} />
                        ) : (
                          <TextArea
                            value={input.value ?? ''}
                            minRows={1}
                            maxRows={6}
                            onChange={(e) => {
                              setInput?.(param, {
                                ...input,
                                value: e.target.value,
                              })
                            }}
                            disabled={data.isLoading}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Text.H6 color='foregroundMuted'>
                No inputs. Use &#123;&#123;input_name&#125;&#125; to insert.
              </Text.H6>
            )}
          </div>
        </ClientOnly>
      </div>
    </div>
  )
}
