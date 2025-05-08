import AverageScoreBadge from '$/components/EvaluationAggregatedResult'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import { useEvaluationsV2, useEvaluationV2Stats } from '$/stores/evaluationsV2'
import {
  DocumentVersion,
  EvaluationMetric,
  EvaluationTmp,
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
  selectedEvaluation?: EvaluationTmp
  setSelectedEvaluation: (evaluation?: EvaluationTmp) => void
}) {
  const { enabled: evaluationsV2Enabled } = useFeatureFlag({
    featureFlag: 'evaluationsV2',
  })

  const { data: evaluationsV1, isLoading: isEvaluationsV1Loading } =
    useEvaluations({
      params: { documentUuid: document.documentUuid },
    })

  const { data: evaluationsV2, isLoading: isEvaluationsV2Loading } =
    useEvaluationsV2({ project, commit, document })

  const evaluations = useMemo<EvaluationTmp[]>(() => {
    return [
      ...(evaluationsV2Enabled ? [] : evaluationsV1).map((evaluation) => ({
        ...evaluation,
        version: 'v1' as const,
      })),
      ...evaluationsV2.map((evaluation) => ({
        ...evaluation,
        version: 'v2' as const,
      })),
    ]
  }, [evaluationsV1, evaluationsV2, evaluationsV2Enabled])

  const selectableState = useSelectableRows<string>({
    rowIds: evaluations.map((e) => e.uuid),
    initialSelection: selectedEvaluation ? [selectedEvaluation.uuid] : [],
  })

  // Keep parent in sync with selection
  useEffect(() => {
    const selectedUuids = selectableState.getSelectedRowIds()
    if (selectedUuids.length === 1) {
      const selected = evaluations.find((e) => e.uuid === selectedUuids[0])
      setSelectedEvaluation(selected)
    } else {
      setSelectedEvaluation(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableState.getSelectedRowIds])

  if (isEvaluationsV1Loading || isEvaluationsV2Loading) {
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
                .documents.detail({ uuid: document.documentUuid }).evaluations
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
                if (!selectableState.isSelected(evaluation.uuid)) {
                  selectableState.clearSelections()
                  selectableState.toggleRow(evaluation.uuid, true)
                } else {
                  selectableState.clearSelections()
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
              <TableCell align='left' onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectableState.isSelected(evaluation.uuid)}
                  onCheckedChange={() => {
                    if (!selectableState.isSelected(evaluation.uuid)) {
                      selectableState.clearSelections()
                      selectableState.toggleRow(evaluation.uuid, true)
                    } else {
                      selectableState.clearSelections()
                    }
                  }}
                  fullWidth={false}
                  aria-label={`Select evaluation ${evaluation.name}`}
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
                {evaluation.version === 'v2' ? (
                  <AverageScoreBadgeV2
                    project={project}
                    commit={commit}
                    document={document}
                    evaluation={evaluation}
                  />
                ) : (
                  <AverageScoreBadge
                    commitUuid={commit.uuid}
                    documentUuid={document.documentUuid}
                    evaluation={evaluation}
                  />
                )}
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
