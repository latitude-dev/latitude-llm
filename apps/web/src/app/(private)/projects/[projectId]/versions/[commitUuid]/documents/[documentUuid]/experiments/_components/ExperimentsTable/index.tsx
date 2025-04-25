'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCommitsFromProject } from '$/stores/commitsStore'
import useDatasets from '$/stores/datasets'
import { useExperiments } from '$/stores/experiments'
import { ExperimentDto } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { DurationCell } from './DurationCell'
import { ScoreCell } from './ScoreCell'
import { cn } from '@latitude-data/web-ui/utils'
import { formatCount } from '$/lib/formatCount'
import { useSearchParams } from 'next/navigation'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DatasetCell } from './DatasetCell'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { EvaluationsCell } from './EvaluationsCell'

type ExperimentStatus = {
  isPending: boolean
  isRunning: boolean
  isFinished: boolean
}

const getStatus = (experiment: ExperimentDto): ExperimentStatus => ({
  isPending: !experiment.startedAt,
  isRunning: !!experiment.startedAt && !experiment.finishedAt,
  isFinished: !!experiment.finishedAt,
})

const countLabel = (count: number): string => {
  return `${count} experiments`
}

export function ExperimentsTable({
  selectedExperiments,
  onSelectExperiment,
}: {
  selectedExperiments: string[]
  onSelectExperiment: (experimentUuid: string) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'

  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()

  const {
    data: experiments,
    count,
    isLoading,
  } = useExperiments({
    projectId: project.id,
    documentUuid: document.documentUuid,
    page: Number(page),
    pageSize: Number(pageSize),
  })

  const { data: commits, isLoading: isLoadingCommits } = useCommitsFromProject(
    project.id,
  )

  return (
    <Table
      externalFooter={
        count && (
          <LinkableTablePaginationFooter
            isLoading={isLoading}
            countLabel={countLabel}
            pagination={buildPagination({
              baseUrl: ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: document.documentUuid })[
                DocumentRoutes.experiments
              ].root,
              count: count ?? 0,
              page: Number(page),
              pageSize: Number(pageSize),
              queryParams: selectedExperiments.length
                ? `selected=${selectedExperiments.join(',')}`
                : undefined,
            })}
          />
        )
      }
    >
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Name</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead tooltipMessage='Average score across all evaluation results. Each result is normalized to a 0-100 scale and averaged together. Any error is evaluated as 0.'>
            Average
          </TableHead>
          <TableHead>Results</TableHead>
          <TableHead>Evaluations</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Dataset</TableHead>
          <TableHead>Rows</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {experiments.map((experiment) => {
          const { isPending, isRunning } = getStatus(experiment)
          const isSelected = selectedExperiments.includes(experiment.uuid)
          const textColor = isSelected ? 'primary' : 'foreground'

          const commit = commits?.find((c) => c.id === experiment.commitId)

          return (
            <TableRow
              key={experiment.id}
              className={cn('border-b-[0.5px] h-12 max-h-12 border-border', {
                'animate-pulse': isRunning,
                'bg-accent hover:bg-accent/50': isSelected,
              })}
            >
              <TableCell
                preventDefault
                align='left'
                onClick={() => onSelectExperiment(experiment.uuid)}
              >
                <Checkbox
                  fullWidth={false}
                  checked={selectedExperiments.includes(experiment.uuid)}
                />
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-2'>
                  {isPending && <Icon name='clock' color='foregroundMuted' />}
                  {isRunning && (
                    <div className='flex flex-row gap-2 items-center'>
                      <Icon name='loader' color='primary' spin />
                      <Text.H5 noWrap color='primary'>
                        {experiment.results.passed +
                          experiment.results.failed +
                          experiment.results.errors}{' '}
                        /{' '}
                        {experiment.metadata.count *
                          experiment.evaluationUuids.length}
                      </Text.H5>
                    </div>
                  )}

                  <Text.H5 noWrap ellipsis color={textColor}>
                    {experiment.name}
                  </Text.H5>
                </div>
              </TableCell>
              <TableCell>
                <div className='flex w-full items-center justify-center'>
                  <DurationCell experiment={experiment} color={textColor} />
                </div>
              </TableCell>
              <TableCell>
                <div className='flex w-full items-center justify-center'>
                  <ScoreCell experiment={experiment} />
                </div>
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-1'>
                  <Tooltip
                    trigger={
                      <Badge
                        variant='successMuted'
                        className={isLoading ? 'animate-pulse' : ''}
                      >
                        {experiment.results.passed}
                      </Badge>
                    }
                  >
                    Passed
                  </Tooltip>
                  <Text.H5 noWrap color='foregroundMuted'>
                    /
                  </Text.H5>
                  <Tooltip
                    trigger={
                      <Badge
                        variant='warningMuted'
                        className={isLoading ? 'animate-pulse' : ''}
                      >
                        {experiment.results.failed}
                      </Badge>
                    }
                  >
                    Failed
                  </Tooltip>
                  <Text.H5 noWrap color='foregroundMuted'>
                    /
                  </Text.H5>
                  <Tooltip
                    trigger={
                      <Badge
                        variant='destructiveMuted'
                        className={isLoading ? 'animate-pulse' : ''}
                      >
                        {experiment.results.errors}
                      </Badge>
                    }
                  >
                    Errors
                  </Tooltip>
                </div>
              </TableCell>
              <TableCell>
                <EvaluationsCell experiment={experiment} />
              </TableCell>
              <TableCell>
                {isLoadingCommits ? (
                  <Skeleton height='h5' className='w-12' />
                ) : (
                  <Tooltip
                    trigger={
                      <Badge
                        variant={commit?.mergedAt ? 'accent' : 'muted'}
                        className={isLoading ? 'animate-pulse' : ''}
                      >
                        {commit?.title ?? 'Unknown version'}
                      </Badge>
                    }
                  >
                    {commit?.uuid ?? 'Unknown version'}
                  </Tooltip>
                )}
              </TableCell>
              <TableCell>
                <DatasetCell
                  isLoading={isLoadingDatasets}
                  datasets={datasets}
                  datasetId={experiment.datasetId}
                />
              </TableCell>
              <TableCell>
                <div className='flex w-full items-center justify-center'>
                  <Text.H5 noWrap color={textColor}>
                    {formatCount(experiment.metadata.count)}
                  </Text.H5>
                </div>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap color={textColor}>
                  {experiment.createdAt?.toLocaleString()}
                </Text.H5>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
