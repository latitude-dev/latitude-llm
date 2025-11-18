import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCommitsFromProject } from '$/stores/commitsStore'
import useDatasets from '$/stores/datasets'
import { useExperiments } from '$/stores/experiments'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
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
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
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
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { relativeTime } from '$/lib/relativeTime'
import { ResultsCell } from './ResultsCell'
import { getStatus } from './shared'
import { ExperimentStatus } from './ExperimentStatus'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'

const countLabel = (count: number): string => {
  return `${count} experiments`
}

export function ExperimentsTable({
  count,
  selectedExperiments,
  onSelectExperiment,
}: {
  count: number
  selectedExperiments: string[]
  onSelectExperiment: (experimentUuid: string) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const searchParams = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')
  const pageSize = Number(searchParams.get('pageSize') ?? '25')

  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()

  const {
    mutate,
    data: experiments,
    isLoading,
  } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
      page,
      pageSize,
    },
    {
      refreshInterval: 30_000, // 30 seconds
    },
  )

  useSockets({
    event: 'experimentStatus',
    onMessage: (message: EventArgs<'experimentStatus'>) => {
      if (!message) return
      if (page > 1) return

      const { experiment: updatedExperiment } = message
      if (updatedExperiment.documentUuid !== document.documentUuid) return

      mutate(
        (prev) => {
          if (!prev) return prev

          const prevExperimentIdx = prev.findIndex(
            (exp) => exp.uuid === updatedExperiment.uuid,
          )
          if (prevExperimentIdx !== -1) {
            // Substitute the previous experiment with the updated one, without moving it in the array
            const newArray = [...prev]
            newArray[prevExperimentIdx] = updatedExperiment
            return newArray
          }

          return [updatedExperiment, ...prev]
        },
        {
          revalidate: false,
        },
      )
    },
  })

  const { data: commits, isLoading: isLoadingCommits } = useCommitsFromProject(
    project.id,
  )

  if (isLoading) {
    return <TableSkeleton cols={9} rows={Math.min(count, pageSize)} />
  }

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
              page,
              pageSize,
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {experiments.map((experiment) => {
          const { isRunning } = getStatus(experiment)
          const isSelected = selectedExperiments.includes(experiment.uuid)
          const textColor = isSelected ? 'primary' : 'foreground'

          const experimentCommit = commits?.find(
            (c) => c.id === experiment.commitId,
          )

          return (
            <TableRow
              key={experiment.id}
              className={cn(
                'border-b-[0.5px] h-12 max-h-12 border-border cursor-pointer',
                {
                  'animate-pulse': isRunning,
                  'bg-accent hover:bg-accent/50': isSelected,
                },
              )}
              onClick={() => onSelectExperiment(experiment.uuid)}
            >
              <TableCell preventDefault align='left'>
                <Checkbox
                  fullWidth={false}
                  checked={selectedExperiments.includes(experiment.uuid)}
                  onCheckedChange={() => onSelectExperiment(experiment.uuid)}
                />
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-2 w-full'>
                  <ExperimentStatus
                    projectId={project.id}
                    commitUuid={commit.uuid}
                    documentUuid={document.documentUuid}
                    experiment={experiment}
                  />
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
                <ResultsCell experiment={experiment} isLoading={isLoading} />
              </TableCell>
              <TableCell>
                <EvaluationsCell experiment={experiment} />
              </TableCell>
              <TableCell>
                {isLoadingCommits ? (
                  <Skeleton height='h5' className='w-12' />
                ) : (
                  <div className='flex flex-row gap-2 items-center min-w-0 max-w-xs'>
                    <Badge
                      variant={experimentCommit?.version ? 'accent' : 'muted'}
                    >
                      <Text.H6 noWrap>
                        {experimentCommit?.version
                          ? `v${experimentCommit.version}`
                          : 'Draft'}
                      </Text.H6>
                    </Badge>
                    <Text.H5
                      noWrap
                      ellipsis
                      color={
                        experimentCommit?.version
                          ? 'foreground'
                          : 'foregroundMuted'
                      }
                    >
                      {experimentCommit?.title ?? 'Removed draft'}
                    </Text.H5>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <DatasetCell
                  isLoading={isLoadingDatasets}
                  datasets={datasets}
                  datasetId={experiment.datasetId ?? undefined}
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
                  <time dateTime={new Date(experiment.createdAt).toISOString()}>
                    {relativeTime(new Date(experiment.createdAt))}
                  </time>
                </Text.H5>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
