import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import {
  CompletedRun,
  LogSources,
  RunSourceGroup,
} from '@latitude-data/constants'
import { ProjectLimitedView } from '@latitude-data/core/schema/models/types/Project'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnnotationProgressPanel } from '$/components/AnnotationProgressPanel'
import { RunsListItem } from './Item'
import { RunSourceSelector } from './SourceSelector'

type CompletedRunsProps = {
  runs: CompletedRun[]
  goToNextPage: () => void
  goToPrevPage: () => void
  hasNext: boolean
  hasPrev: boolean
  isLoading?: boolean
  countBySource?: Record<LogSources, number>
  totalCount?: number
  limitedView?: Pick<ProjectLimitedView, 'totalRuns'>
}

export function RunsList({
  issuesEnabled,
  completed,
  selectedRunUuid,
  setSelectedRunUuid,
  sourceGroup,
  setSourceGroup,
}: {
  issuesEnabled: boolean
  completed: CompletedRunsProps
  selectedRunUuid?: string
  setSelectedRunUuid: (uuid?: string) => void
  sourceGroup: RunSourceGroup
  setSourceGroup: (sourceGroup: RunSourceGroup) => void
}) {
  return (
    <div className='w-full h-full flex flex-col gap-6 p-6 relative'>
      <div className='w-full min-h-0 flex flex-col justify-start items-start gap-4 overflow-hidden'>
        <div className='w-full flex justify-between items-center gap-2'>
          <div className='flex flex-col gap-1'>
            <Text.H3>Annotations</Text.H3>
            <Text.H6 color='foregroundMuted'>
              Annotate the traces that <strong>your AI generated</strong>. It
              will help Latitude improve the evaluation quality.
            </Text.H6>
          </div>
        </div>
        {issuesEnabled ? (
          <div className='w-full flex-shrink-0'>
            <AnnotationProgressPanel />
          </div>
        ) : null}
      </div>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-4'>
        <div className='w-full flex justify-between items-center gap-1'>
          <div className='flex flex-col gap-1'>
            <Text.H4M>Traces</Text.H4M>
            <Text.H6 color='foregroundMuted'>
              This is the results of your AI runs. Select a trace to start
            </Text.H6>
          </div>
          <div>
            <RunSourceSelector value={sourceGroup} setValue={setSourceGroup} />
          </div>
        </div>
        {completed.runs.length > 0 ? (
          <div className='w-full min-h-0 flex flex-col border border-border rounded-xl overflow-hidden'>
            <div className='w-full flex flex-col divide-border divide-y rounded-t-xl overflow-hidden overflow-y-auto custom-scrollbar relative'>
              {completed.runs.map((run) => (
                <RunsListItem
                  key={run.uuid}
                  run={run}
                  isSelected={selectedRunUuid === run.uuid}
                  setSelectedRunUuid={setSelectedRunUuid}
                />
              ))}
            </div>
            <div className='w-full h-12 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-1 py-1'>
              <SimpleKeysetTablePaginationFooter
                setNext={completed.goToNextPage}
                setPrev={completed.goToPrevPage}
                hasNext={completed.hasNext}
                hasPrev={completed.hasPrev}
                count={
                  completed.totalCount ??
                  completed.limitedView?.totalRuns ??
                  null
                }
                countLabel={(count) => `${count} runs`}
                isLoading={completed.isLoading}
              />
            </div>
          </div>
        ) : (
          <div className='w-full h-full flex items-center justify-center gap-2 py-9 px-4 border border-border border-dashed rounded-xl'>
            <Text.H5 color='foregroundMuted'>No traces found</Text.H5>
          </div>
        )}
      </div>
    </div>
  )
}
