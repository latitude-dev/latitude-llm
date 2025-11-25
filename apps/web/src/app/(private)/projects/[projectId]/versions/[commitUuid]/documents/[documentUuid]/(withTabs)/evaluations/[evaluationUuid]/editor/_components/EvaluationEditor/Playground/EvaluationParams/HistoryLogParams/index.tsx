import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  type ICommitContextType,
} from '$/app/providers/CommitProvider'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { EditableParameters } from './EditableParameters'
import { type UseLogHistoryParams } from './useLogHistoryParams'
import { EvaluationType } from '@latitude-data/core/constants'
import { ROUTES } from '$/services/routes'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

function DocumentLogsNavigation({ data }: { data: UseLogHistoryParams }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const url = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).traces.root
  const route = data.selectedPromptSpan
    ? `${url}?spanId=${data.selectedPromptSpan.id}&traceId=${data.selectedPromptSpan.traceId}`
    : undefined

  return (
    <>
      {data.isLoading || data.selectedPromptSpan || data.urlPromptSpan ? (
        <>
          <div className='flex flex-grow min-w-0'>
            {data.isLoading ? (
              <div className='flex flex-row gap-x-2 w-full'>
                <Skeleton height='h3' className='w-2/3' />
                <Skeleton height='h3' className='w-1/3' />
              </div>
            ) : null}
            {!data.isLoading && route && data.selectedPromptSpan ? (
              <Link
                href={route}
                className='flex-grow min-w-0 flex flex-row items-center gap-x-2'
              >
                <Text.H5 ellipsis noWrap>
                  {data.selectedPromptSpan?.startedAt instanceof Date
                    ? data.selectedPromptSpan?.startedAt.toISOString()
                    : data.selectedPromptSpan?.startedAt}
                </Text.H5>
                <Badge variant='accent'>
                  {data.selectedPromptSpan?.id.slice(0, 8)}
                </Badge>
                <Icon
                  name='externalLink'
                  color='foregroundMuted'
                  className='flex-none'
                />
              </Link>
            ) : null}
          </div>
          {data.urlPromptSpan ? (
            <Button variant='link' onClick={data.clearUrlSelection}>
              Clear selection
            </Button>
          ) : (
            <SimpleKeysetTablePaginationFooter
              isLoading={data.isLoading}
              hasNext={data.hasNext}
              hasPrev={data.hasPrev}
              setPrev={data.onPrevPage}
              setNext={data.onNextPage}
            />
          )}
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
    </div>
  )
}
