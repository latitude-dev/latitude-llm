import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import { useCommitsFromProject } from '$/stores/commitsStore'
import useDatasets from '$/stores/datasets'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useExperiments } from '$/stores/experiments'
import { useOptimizations, useOptimizationsCount } from '$/stores/optimizations'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { ConfirmModal, Modal } from '@latitude-data/web-ui/atoms/Modal'
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
  BlankSlateStep,
  BlankSlateWithSteps,
} from '@latitude-data/web-ui/molecules/BlankSlateWithSteps'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { OptimizationDetails } from './OptimizationDetails'

// TODO(AO/OPT): Review & implement

type OptimizationPhase = {
  label: string
  isActive: boolean
  isCompleted: boolean
  hasError: boolean
}

function getOptimizationPhase(optimization: Optimization): OptimizationPhase {
  const hasError = !!optimization.error

  if (hasError) {
    return {
      label: 'Failed',
      isActive: false,
      isCompleted: true,
      hasError: true,
    }
  }
  if (optimization.finishedAt) {
    return {
      label: 'Completed',
      isActive: false,
      isCompleted: true,
      hasError: false,
    }
  }
  if (optimization.validatedAt) {
    return {
      label: 'Wrapping up...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }
  if (optimization.executedAt) {
    return {
      label: 'Validating...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }
  if (optimization.preparedAt) {
    return {
      label: 'Executing...',
      isActive: true,
      isCompleted: false,
      hasError: false,
    }
  }
  return {
    label: 'Preparing...',
    isActive: true,
    isCompleted: false,
    hasError: false,
  }
}

function getElapsedTime(
  start: Date | null,
  end: Date | null | undefined,
): number | undefined {
  if (!start) return undefined
  const endTime = end ? new Date(end).getTime() : Date.now()
  return endTime - new Date(start).getTime()
}

function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor(ms / (1000 * 60 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function scoreBadgeVariant(score: number): BadgeProps['variant'] {
  if (score >= 80) return 'successMuted'
  if (score >= 50) return 'warningMuted'
  return 'destructiveMuted'
}

function getExperimentScore(experiment: ExperimentDto): number | undefined {
  const count =
    experiment.results.passed +
    experiment.results.failed +
    experiment.results.errors
  return count > 0 ? experiment.results.totalScore / count : undefined
}

function OptimizationStatusCell({
  optimization,
  onCancelClick,
}: {
  optimization: Optimization
  onCancelClick: () => void
}) {
  const [now, setNow] = useState(new Date())
  const [isHovered, setIsHovered] = useState(false)
  const phase = getOptimizationPhase(optimization)

  useEffect(() => {
    if (!phase.isActive) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [phase.isActive])

  const elapsed = getElapsedTime(
    optimization.createdAt ? new Date(optimization.createdAt) : null,
    phase.isActive
      ? now
      : optimization.finishedAt
        ? new Date(optimization.finishedAt)
        : undefined,
  )

  const textColor = phase.hasError
    ? 'destructive'
    : phase.isActive
      ? 'primary'
      : 'foreground'

  if (phase.isActive) {
    return (
      <Tooltip
        asChild
        trigger={
          <Button
            variant='ghost'
            className='p-0'
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
              e.stopPropagation()
              onCancelClick()
            }}
          >
            <div className='flex flex-row gap-2 items-center'>
              {isHovered ? (
                <Icon name='circleStop' color='destructive' />
              ) : (
                <Icon name='loader' color='primary' spin />
              )}
              <div className='flex flex-col items-start'>
                <Text.H5
                  noWrap
                  color={isHovered ? 'destructive' : 'primary'}
                  animate
                >
                  {phase.label}
                </Text.H5>
                {elapsed !== undefined && (
                  <Text.H6 noWrap color='foregroundMuted'>
                    {formatDuration(elapsed)}
                  </Text.H6>
                )}
              </div>
            </div>
          </Button>
        }
      >
        Cancel optimization
      </Tooltip>
    )
  }

  return (
    <div className='flex flex-row gap-2 items-center'>
      {phase.hasError ? (
        <Icon name='alertCircle' color='destructive' />
      ) : (
        <Icon name='check' color='success' />
      )}
      <div className='flex flex-col items-start'>
        <Text.H5 noWrap color={textColor}>
          {phase.label}
        </Text.H5>
        {elapsed !== undefined && (
          <Text.H6 noWrap color='foregroundMuted'>
            {formatDuration(elapsed)}
          </Text.H6>
        )}
        {phase.hasError && optimization.error && (
          <Tooltip
            trigger={
              <Text.H6 noWrap color='destructive' ellipsis>
                {optimization.error}
              </Text.H6>
            }
          >
            {optimization.error}
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function VersionCell({
  commitId,
  commits,
  projectId,
  isLoading,
  hasError,
}: {
  commitId: number
  commits?: Commit[]
  projectId: number
  isLoading: boolean
  hasError: boolean
}) {
  const commit = useMemo(
    () => commits?.find((c) => c.id === commitId),
    [commits, commitId],
  )

  if (isLoading) {
    return <Skeleton height='h5' className='w-16' />
  }

  if (!commit) {
    return <Text.H5 color='foregroundMuted'>-</Text.H5>
  }

  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commit.uuid }).root

  return (
    <Link href={href} onClick={(e) => e.stopPropagation()}>
      <div className='flex flex-row gap-2 items-center min-w-0 max-w-xs'>
        <Badge variant={commit.version ? 'accent' : 'muted'}>
          <div className='flex flex-row gap-1 items-center'>
            <Text.H6 noWrap>
              {commit.version ? `v${commit.version}` : 'Draft'}
            </Text.H6>
            <Icon name='externalLink' size='small' />
          </div>
        </Badge>
        <Text.H5
          noWrap
          ellipsis
          color={
            hasError
              ? 'destructive'
              : commit.version
                ? 'foreground'
                : 'foregroundMuted'
          }
        >
          {commit.title}
        </Text.H5>
      </div>
    </Link>
  )
}

function EvaluationCell({
  evaluationUuid,
  evaluations,
  projectId,
  commitUuid,
  documentUuid,
  isLoading,
  hasError,
}: {
  evaluationUuid: string
  evaluations: EvaluationV2[]
  projectId: number
  commitUuid: string
  documentUuid: string
  isLoading: boolean
  hasError: boolean
}) {
  const evaluation = useMemo(
    () => evaluations.find((e) => e.uuid === evaluationUuid),
    [evaluations, evaluationUuid],
  )

  if (isLoading) {
    return <Skeleton height='h5' className='w-20' />
  }

  if (!evaluation) {
    return (
      <Badge variant='secondary' ellipsis noWrap>
        <Text.H6 color={hasError ? 'destructive' : 'foregroundMuted'}>
          Unknown
        </Text.H6>
      </Badge>
    )
  }

  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid })
    .evaluations.detail({ uuid: evaluationUuid }).root

  return (
    <Link href={href} onClick={(e) => e.stopPropagation()}>
      <Badge variant='secondary' ellipsis noWrap>
        <div className='flex flex-row gap-1 items-center'>
          <Text.H6 color={hasError ? 'destructive' : 'foreground'}>
            {evaluation.name}
          </Text.H6>
          <Icon name='externalLink' size='small' />
        </div>
      </Badge>
    </Link>
  )
}

function TrainsetCell({
  datasetId,
  datasets,
  isLoading,
  hasError,
}: {
  datasetId?: number | null
  datasets?: Dataset[]
  isLoading: boolean
  hasError: boolean
}) {
  const dataset = useMemo(
    () => (datasetId ? datasets?.find((d) => d.id === datasetId) : undefined),
    [datasets, datasetId],
  )

  if (isLoading) {
    return <Skeleton height='h5' className='w-16' />
  }

  if (!datasetId) {
    return (
      <Text.H5 color={hasError ? 'destructive' : 'foregroundMuted'}>-</Text.H5>
    )
  }

  const datasetHref = ROUTES.datasets.detail(datasetId)

  return (
    <Link href={datasetHref} onClick={(e) => e.stopPropagation()}>
      <Badge variant='secondary' ellipsis noWrap>
        <div className='flex flex-row gap-1 items-center'>
          <Text.H6 color={hasError ? 'destructive' : 'foreground'}>
            {dataset?.name ?? 'Unknown'}
          </Text.H6>
          <Icon name='externalLink' size='small' />
        </div>
      </Badge>
    </Link>
  )
}

function ExperimentScoreCell({
  datasetId,
  experimentId,
  datasets,
  experiments,
  isLoadingDatasets,
  isLoadingExperiments,
  hasError,
}: {
  datasetId?: number | null
  experimentId?: number | null
  datasets?: Dataset[]
  experiments?: ExperimentDto[]
  isLoadingDatasets: boolean
  isLoadingExperiments: boolean
  hasError: boolean
}) {
  const dataset = useMemo(
    () => (datasetId ? datasets?.find((d) => d.id === datasetId) : undefined),
    [datasets, datasetId],
  )
  const experiment = useMemo(
    () =>
      experimentId
        ? experiments?.find((e) => e.id === experimentId)
        : undefined,
    [experiments, experimentId],
  )

  if (isLoadingDatasets || isLoadingExperiments) {
    return <Skeleton height='h5' className='w-16' />
  }

  if (!datasetId) {
    return (
      <Text.H5 color={hasError ? 'destructive' : 'foregroundMuted'}>-</Text.H5>
    )
  }

  const datasetHref = ROUTES.datasets.detail(datasetId)
  const score = experiment ? getExperimentScore(experiment) : undefined
  const scoreText =
    score !== undefined
      ? score % 1 < 0.01
        ? score.toFixed(0)
        : score.toFixed(2)
      : undefined

  return (
    <div className='flex flex-row gap-2 items-center'>
      <Link href={datasetHref} onClick={(e) => e.stopPropagation()}>
        <Badge variant='secondary' ellipsis noWrap>
          <div className='flex flex-row gap-1 items-center'>
            <Text.H6 color={hasError ? 'destructive' : 'foreground'}>
              {dataset?.name ?? 'Unknown'}
            </Text.H6>
            <Icon name='externalLink' size='small' />
          </div>
        </Badge>
      </Link>
      {scoreText !== undefined && (
        <Badge variant={scoreBadgeVariant(score!)}>{scoreText}</Badge>
      )}
    </div>
  )
}

function DraftCell({
  draftId,
  commits,
  projectId,
  isLoading,
  hasError,
}: {
  draftId?: number | null
  commits?: Commit[]
  projectId: number
  isLoading: boolean
  hasError: boolean
}) {
  const commit = useMemo(
    () => (draftId ? commits?.find((c) => c.id === draftId) : undefined),
    [commits, draftId],
  )

  if (isLoading) {
    return <Skeleton height='h5' className='w-16' />
  }

  if (!draftId || !commit) {
    return (
      <Text.H5 color={hasError ? 'destructive' : 'foregroundMuted'}>-</Text.H5>
    )
  }

  const href = ROUTES.projects
    .detail({ id: projectId })
    .commits.detail({ uuid: commit.uuid }).root

  return (
    <Link href={href} onClick={(e) => e.stopPropagation()}>
      <div className='flex flex-row gap-2 items-center min-w-0 max-w-xs'>
        <Badge variant={commit.version ? 'accent' : 'muted'}>
          <div className='flex flex-row gap-1 items-center'>
            <Text.H6 noWrap>
              {commit.version ? `v${commit.version}` : 'Draft'}
            </Text.H6>
            <Icon name='externalLink' size='small' />
          </div>
        </Badge>
        <Text.H5
          noWrap
          ellipsis
          color={
            hasError
              ? 'destructive'
              : commit.version
                ? 'foreground'
                : 'foregroundMuted'
          }
        >
          {commit.title}
        </Text.H5>
      </div>
    </Link>
  )
}

function StartedAtCell({
  createdAt,
  hasError,
}: {
  createdAt: Date
  hasError: boolean
}) {
  return (
    <Text.H5 noWrap color={hasError ? 'destructive' : 'foreground'}>
      <time dateTime={new Date(createdAt).toISOString()}>
        {relativeTime(new Date(createdAt))}
      </time>
    </Text.H5>
  )
}

export function OptimizationsTable({
  optimizations,
  selectedOptimization,
  setSelectedOptimization,
  setOpenStartModal,
  cancelOptimization,
  isCancelingOptimization,
  search,
  setSearch,
  isLoading,
}: {
  optimizations: OptimizationWithDetails[]
  selectedOptimization?: OptimizationWithDetails
  setSelectedOptimization: (optimization?: OptimizationWithDetails) => void
  setOpenStartModal: (open: boolean) => void
  cancelOptimization: ReturnType<typeof useOptimizations>['cancelOptimization']
  isCancelingOptimization: boolean
  search: Required<Pagination>
  setSearch: (search: Required<Pagination>) => void
  isLoading?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: count, isLoading: isCountLoading } = useOptimizationsCount({
    project: project,
    commit: commit,
    document: document,
  })

  const { data: commits, isLoading: isLoadingCommits } = useCommitsFromProject(
    project.id,
  )
  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()
  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({
      project,
      commit,
      document,
    })
  const { data: experiments, isLoading: isLoadingExperiments } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
      pageSize: 100,
    },
  )

  const [openDetailsModal, setOpenDetailsModal] = useState(false)

  const [openCancelModal, setOpenCancelModal] = useState(false)
  const onCancel = useCallback(
    async (optimization: OptimizationWithDetails) => {
      if (isCancelingOptimization) return
      const [_, errors] = await cancelOptimization({
        optimizationId: optimization.id,
      })
      if (errors) return
      setOpenCancelModal(false)
    },
    [isCancelingOptimization, cancelOptimization, setOpenCancelModal],
  )

  return (
    <div className='flex flex-col gap-4'>
      {optimizations.length > 0 ? (
        <div className='flex flex-col gap-4'>
          <Table
            className='table-auto'
            externalFooter={
              <LogicTablePaginationFooter
                page={search.page}
                pageSize={search.pageSize}
                count={count}
                countLabel={(count) => `${count} optimizations`}
                onPageChange={(page) => setSearch({ ...search, page })}
                isLoading={isCountLoading || isLoading}
              />
            }
          >
            <TableHeader className='isolate sticky top-0 z-10'>
              <TableRow>
                <TableHead>Status</TableHead>
                {/* TODO(AO/OPT): Rename to baseline and add experiment info */}
                <TableHead>Version</TableHead>
                {/* TODO(AO/OPT): Move evaluation after status */}
                <TableHead>Evaluation</TableHead>
                {/* TODO(AO/OPT): Move datasets after evaluation */}
                <TableHead>Trainset</TableHead>
                <TableHead>Testset</TableHead>
                {/* TODO(AO/OPT): Remove goldset */}
                <TableHead>Goldset</TableHead>
                {/* TODO(AO/OPT): Rename to optimized and add experiment info */}
                <TableHead>Draft</TableHead>
                <TableHead>Started At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow
                    key={index}
                    className='border-b-[0.5px] h-12 max-h-12 border-border relative'
                    hoverable={false}
                  >
                    <TableCell>
                      <Skeleton className='h-5 w-[90%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                optimizations.map((optimization) => {
                  const phase = getOptimizationPhase(optimization)
                  const hasError = phase.hasError

                  return (
                    <TableRow
                      key={optimization.uuid}
                      className={cn(
                        'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors',
                        { 'animate-pulse': phase.isActive },
                      )}
                      onClick={() => {
                        setSelectedOptimization(optimization)
                        setOpenDetailsModal(true)
                      }}
                    >
                      <TableCell>
                        <OptimizationStatusCell
                          optimization={optimization}
                          onCancelClick={() => {
                            setSelectedOptimization(optimization)
                            setOpenCancelModal(true)
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <VersionCell
                          commitId={optimization.commitId}
                          commits={commits}
                          projectId={project.id}
                          isLoading={isLoadingCommits}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <EvaluationCell
                          evaluationUuid={optimization.evaluationUuid}
                          evaluations={evaluations}
                          projectId={project.id}
                          commitUuid={commit.uuid}
                          documentUuid={document.documentUuid}
                          isLoading={isLoadingEvaluations}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <TrainsetCell
                          datasetId={optimization.trainsetId}
                          datasets={datasets}
                          isLoading={isLoadingDatasets}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <ExperimentScoreCell
                          datasetId={optimization.testsetId}
                          experimentId={optimization.testExperimentId}
                          datasets={datasets}
                          experiments={experiments}
                          isLoadingDatasets={isLoadingDatasets}
                          isLoadingExperiments={isLoadingExperiments}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <ExperimentScoreCell
                          datasetId={optimization.goldsetId}
                          experimentId={optimization.goldExperimentId}
                          datasets={datasets}
                          experiments={experiments}
                          isLoadingDatasets={isLoadingDatasets}
                          isLoadingExperiments={isLoadingExperiments}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <DraftCell
                          draftId={optimization.draftId}
                          commits={commits}
                          projectId={project.id}
                          isLoading={isLoadingCommits}
                          hasError={hasError}
                        />
                      </TableCell>
                      <TableCell>
                        <StartedAtCell
                          createdAt={optimization.createdAt}
                          hasError={hasError}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
          {openDetailsModal && selectedOptimization && (
            <Modal
              dismissible
              size='medium'
              open={openDetailsModal}
              title='Optimization details'
              description='View the details of the optimization'
              onOpenChange={setOpenDetailsModal}
            >
              <OptimizationDetails optimization={selectedOptimization} />
            </Modal>
          )}
          {openCancelModal && selectedOptimization && (
            <ConfirmModal
              dismissible
              open={openCancelModal}
              title='Cancel optimization'
              type='destructive'
              onOpenChange={setOpenCancelModal}
              onConfirm={() => onCancel(selectedOptimization)}
              onCancel={() => setOpenCancelModal(false)}
              confirm={{
                label: isCancelingOptimization ? 'Canceling...' : 'Cancel',
                description:
                  'Are you sure you want to cancel the optimization? This action cannot be undone.',
                disabled: isCancelingOptimization,
                isConfirming: isCancelingOptimization,
              }}
            />
          )}
        </div>
      ) : (
        <OptimizationsTableBlankSlate setOpenStartModal={setOpenStartModal} />
      )}
    </div>
  )
}

function OptimizationsTableBlankSlate({
  setOpenStartModal,
}: {
  setOpenStartModal: (open: boolean) => void
}) {
  return (
    <BlankSlateWithSteps
      title='Welcome to optimizations'
      description='There are no optimizations created yet. Check out how it works before getting started.'
    >
      <BlankSlateStep
        number={1}
        title='Learn how it works'
        description='Watch the video below to see how optimizations can be used to improve the quality of your prompts.'
      >
        <iframe
          className='w-full aspect-video rounded-md'
          src={`https://www.youtube.com/embed/trOwCWaIAZk`}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          allowFullScreen
          title='How to optimize your prompts using LLMs and Latitude.so'
        />
      </BlankSlateStep>
      <BlankSlateStep
        number={2}
        title='Start an optimization'
        description='Our AI can craft an optimization just for this specific prompt, try it out!'
        className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
      >
        <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
          <div className='max-h-[272px] overflow-hidden'>
            <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
              {`
---
  provider: OpenAI
  model: gpt-5.2
---
This is just a placeholder for the optimized prompt because crafting it takes a bit longer than we'd like. Click the button to actually start the optimization, it's free as this one is on us.

Don't rawdog your prompts!
            `.trim()}
            </span>
          </div>
          <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-secondary to-transparent pointer-events-none'></div>
          <div className='flex justify-center absolute right-0 bottom-4 w-full'>
            <Button fancy onClick={() => setOpenStartModal(true)}>
              Start an optimization
            </Button>
          </div>
        </div>
      </BlankSlateStep>
    </BlankSlateWithSteps>
  )
}
