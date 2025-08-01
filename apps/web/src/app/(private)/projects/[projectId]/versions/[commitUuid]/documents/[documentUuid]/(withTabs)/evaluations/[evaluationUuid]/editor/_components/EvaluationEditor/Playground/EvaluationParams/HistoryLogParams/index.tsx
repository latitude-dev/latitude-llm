import { ParametersPaginationNav } from '$/components/ParametersPaginationNav'
import { usePaginatedDocumentLogUrl } from '$/hooks/playgrounds/usePaginatedDocumentLogUrl'
import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { EditableParameters } from './EditableParameters'
import { type UseLogHistoryParams } from './useLogHistoryParams'

function DocumentLogsNavigation({ data }: { data: UseLogHistoryParams }) {
  const urlData = usePaginatedDocumentLogUrl({
    selectedLog: data.selectedLog,
    page: data.page,
    isLoading: data.isLoadingLog,
  })

  const hasLogs = data.count > 0
  return (
    <>
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
    </>
  )
}

export function HistoryLogParams({
  commit,
  document,
  evaluation,
  data,
}: {
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  data: UseLogHistoryParams
}) {
  const isLoading = data.isLoading
  return (
    <div className='flex flex-col gap-y-4 min-h-0 w-full'>
      <div className='flex flex-col gap-y-4'>
        <div className='flex flex-row gap-x-4 justify-between items-center border-border border-b pb-4 mr-4'>
          <DocumentLogsNavigation data={data} />
        </div>
      </div>
      {data.error ? (
        <div className='w-full flex justify-center pr-4'>
          <Alert
            variant='destructive'
            description={data.error || 'Error while fetching logs'}
          />
        </div>
      ) : (
        <div
          className={cn(
            'w-full p-1 pb-3.5 flex flex-col gap-y-4 custom-scrollbar',
            {
              'opacity-50': data.isLoading,
            },
          )}
        >
          <EditableParameters
            commit={commit}
            document={document}
            evaluation={evaluation}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  )
}
