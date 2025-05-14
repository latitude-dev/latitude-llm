import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2, useEvaluationV2Stats } from '$/stores/evaluationsV2'
import {
  DocumentVersion,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
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
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useEffect, useMemo } from 'react'

export function Step1({
  project,
  commit,
  document,
  selectedEvaluation,
  setSelectedEvaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  selectedEvaluation?: EvaluationV2
  setSelectedEvaluation: (evaluation?: EvaluationV2) => void
}) {
  const { data: evaluations, isLoading } = useEvaluationsV2({
    project,
    commit,
    document,
  })

  const selectableState = useSelectableRows<string>({
    rowIds: evaluations.map((e) => e.uuid),
    initialSelection: selectedEvaluation ? [selectedEvaluation.uuid] : [],
  })

  useEffect(() => {
    const selectedUuids = selectableState.getSelectedRowIds()
    if (selectedUuids.length) {
      setSelectedEvaluation(
        evaluations.find((e) => e.uuid === selectedUuids[0]),
      )
    } else setSelectedEvaluation(undefined)
  }, [selectableState.getSelectedRowIds])

  if (isLoading) {
    return (
      <TableSkeleton rows={7} cols={['Name', 'Description', 'Average score']} />
    )
  }

  if (!evaluations.length) {
    return (
      <TableBlankSlate
        description='There are no evaluations created yet. You need to evaluate some logs to refine the prompt.'
        link={
          <Link
            href={
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: document.documentUuid }).evaluationsV2
                .root
            }
          >
            <Button>Add an evaluation</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div className='flex flex-col gap-y-4'>
      <Table className='table-auto'>
        <TableHeader className='sticky top-0 z-10'>
          <TableRow>
            <TableHead />
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Average score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='max-h-full overflow-y-auto'>
          {evaluations.map((evaluation) => (
            <TableRow
              key={evaluation.uuid}
              onClick={() => {
                selectableState.clearSelections()
                if (!selectableState.isSelected(evaluation.uuid)) {
                  selectableState.toggleRow(evaluation.uuid, true)
                }
              }}
              className={cn(
                'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors',
                {
                  'bg-secondary hover:bg-secondary/50':
                    selectableState.isSelected(evaluation.uuid),
                },
              )}
            >
              <TableCell align='left'>
                <Checkbox
                  fullWidth={false}
                  checked={selectableState.isSelected(evaluation.uuid)}
                />
              </TableCell>
              <TableCell>
                <Text.H5 noWrap ellipsis>
                  {evaluation.name}
                </Text.H5>
              </TableCell>
              <TableCell className='max-w-72'>
                <Text.H5>{evaluation.description || '-'}</Text.H5>
              </TableCell>
              <TableCell>
                <AverageScoreBadgeV2
                  project={project}
                  commit={commit}
                  document={document}
                  evaluation={evaluation}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AverageScoreBadgeV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  project,
  commit,
  document,
  evaluation,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluation: EvaluationV2<T, M>
}) {
  const { data: stats, isLoading } = useEvaluationV2Stats<T, M>({
    project: project,
    commit: commit,
    document: document,
    evaluation: evaluation,
  })

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  const configuration = metricSpecification.chartConfiguration({ evaluation })

  const averageScore = Number(
    configuration.scale(stats?.averageScore ?? 0).toFixed(2),
  )

  const color = useMemo(() => {
    if (
      (configuration.thresholds.lower &&
        averageScore < configuration.thresholds.lower) ||
      (configuration.thresholds.upper &&
        averageScore > configuration.thresholds.upper)
    ) {
      return 'destructiveMuted'
    }

    return 'successMuted'
  }, [averageScore, configuration])

  if (isLoading) return <Skeleton className='w-full h-4' />

  if (stats?.averageScore === undefined) return '-'

  return <Badge variant={color}>{configuration.format(averageScore)}</Badge>
}
