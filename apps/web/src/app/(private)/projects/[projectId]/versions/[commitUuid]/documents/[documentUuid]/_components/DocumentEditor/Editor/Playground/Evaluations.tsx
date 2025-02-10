import { EvaluationRoutes, ROUTES } from '$/services/routes'
import useConnectedEvaluations from '$/stores/connectedEvaluations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import {
  ConnectedEvaluation,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  ClientOnly,
  CollapsibleBox,
  OnExpandFn,
  Skeleton,
  Text,
  Tooltip,
  cn,
  useCurrentProject,
  type ICommitContextType,
  type IProjectContextType,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import LiveEvaluationToggle from '../../../../evaluations/[evaluationId]/_components/Actions/LiveEvaluationToggle'
import { ResultCellContent as OriginalResultCellContent } from '../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'

type ContentProps = {
  results: Record<number, EvaluationResultDto>
  evaluations: (EvaluationDto & { live: ConnectedEvaluation['live'] })[]
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  runCount: number
  isLoading: boolean
  isWaiting: boolean
}

function ResultCellContent({
  result,
  evaluation,
}: {
  result: EvaluationResultDto
  evaluation: EvaluationDto
}) {
  if (result.resultableType === EvaluationResultableType.Text) {
    return (
      <Tooltip asChild trigger={<Badge variant='outline'>text</Badge>}>
        {result.result}
      </Tooltip>
    )
  }

  return (
    <OriginalResultCellContent evaluation={evaluation} value={result.result} />
  )
}

function EvaluationItemContent({
  result,
  evaluation,
  runCount,
  isWaiting,
}: {
  result?: EvaluationResultDto
  evaluation: ContentProps['evaluations'][number]
  runCount: number
  isWaiting: boolean
}) {
  if (!runCount || !evaluation.live || (!isWaiting && !result)) {
    return (
      <Text.H6
        userSelect={false}
        color='foregroundMuted'
        lineHeight='h5'
        wordBreak='breakAll'
        ellipsis
        lineClamp={3}
      >
        {evaluation.description}
      </Text.H6>
    )
  }

  if (isWaiting) {
    return (
      <span className='flex flex-col gap-y-2.5 pt-1'>
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-full' />
      </span>
    )
  }

  return (
    <Text.H6 color='foregroundMuted' wordBreak='breakAll'>
      {result!.reason || 'No reason'}
    </Text.H6>
  )
}

function EvaluationItem({
  result,
  evaluation,
  document,
  commit,
  project,
  runCount,
  isWaiting,
}: Omit<ContentProps, 'results' | 'evaluations'> & {
  result?: EvaluationResultDto
  evaluation: ContentProps['evaluations'][number]
}) {
  const route = useMemo(() => {
    const query = new URLSearchParams()
    query.set(
      'back',
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid }).root,
    )
    if (evaluation.live && !isWaiting && result?.evaluatedProviderLogId) {
      query.set('providerLogId', result.evaluatedProviderLogId.toString())
    }

    return (
      ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
        EvaluationRoutes.editor
      ].root + `?${query.toString()}`
    )
  }, [project, commit, document, result, evaluation])

  return (
    <div
      className={cn(
        'flex flex-col flex-grow flex-shrink items-center justify-start gap-2',
        'border p-4 rounded-lg overflow-hidden',
        'h-full basis-full',
        (!runCount || (runCount === 1 && isWaiting)) && 'h-32 basis-60',
      )}
    >
      <div className='flex flex-row items-center justify-between gap-2 w-full'>
        <span className='flex flex-row items-center gap-x-2 truncate'>
          <Text.H5 ellipsis noWrap>
            {evaluation.name}
          </Text.H5>
          {evaluation.live && !isWaiting && result && (
            <ResultCellContent result={result} evaluation={evaluation} />
          )}
        </span>
        <div className='flex flex-row items-center gap-2 flex-shrink-0'>
          <LiveEvaluationToggle
            documentUuid={document.documentUuid}
            evaluation={evaluation}
          />
          <Link href={route}>
            <Button
              variant='ghost'
              size='icon'
              iconProps={{
                name: 'settings',
              }}
            />
          </Link>
        </div>
      </div>
      <div className='w-full h-full !leading-5'>
        <EvaluationItemContent
          result={result}
          evaluation={evaluation}
          runCount={runCount}
          isWaiting={isWaiting}
        />
      </div>
    </div>
  )
}

function ExpandedContent({
  results,
  evaluations,
  isLoading,
  ...rest
}: ContentProps) {
  if (isLoading) {
    return (
      <div className='w-full flex gap-4 items-center justify-center flex-wrap'>
        <Skeleton className='h-32 flex flex-col flex-grow basis-60 flex-shrink' />
        <Skeleton className='h-32 flex flex-col flex-grow basis-60 flex-shrink' />
      </div>
    )
  }

  if (!evaluations.length) {
    return (
      <div className='w-full flex gap-4 items-center justify-center'>
        <Text.H5 userSelect={false} color='foregroundMuted'>
          There are no evaluations connected yet
        </Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full flex gap-4 items-center justify-center flex-wrap'>
      {evaluations.map((evaluation) => (
        <EvaluationItem
          key={evaluation.uuid}
          result={results[evaluation.id]}
          evaluation={evaluation}
          isLoading={isLoading}
          {...rest}
        />
      ))}
    </div>
  )
}

function ExpandedContentHeader({ document, commit, project }: ContentProps) {
  const route = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

  return (
    <div className='w-full flex items-center justify-end gap-4'>
      <Link href={route}>
        <Button variant='link'>+ Connect an evaluation</Button>
      </Link>
    </div>
  )
}

function CollapsedContentHeader({
  results,
  evaluations,
  runCount,
  isLoading,
  isWaiting,
}: ContentProps) {
  const count = useMemo(() => {
    return evaluations.reduce(
      (acc, evaluation) => {
        if (!evaluation.live) return { ...acc, skipped: acc.skipped + 1 }
        if (!results[evaluation.id]) return { ...acc, skipped: acc.skipped + 1 }

        let value = results[evaluation.id]!.result
        if (value === undefined) return acc

        if (evaluation.resultType === EvaluationResultableType.Boolean) {
          value = typeof value === 'string' ? value === 'true' : Boolean(value)
          return value ? { ...acc, passed: acc.passed + 1 } : acc
        }

        if (evaluation.resultType === EvaluationResultableType.Number) {
          value = Number(value)
          return value >= evaluation.resultConfiguration.maxValue
            ? { ...acc, passed: acc.passed + 1 }
            : acc
        }

        return { ...acc, passed: acc.passed + 1 }
      },
      { passed: 0, skipped: 0 },
    )
  }, [results, evaluations])

  if (isLoading || isWaiting) {
    return (
      <div className='w-full flex items-center justify-end'>
        <Skeleton className='w-36 h-4' />
      </div>
    )
  }

  if (!evaluations.length) {
    return null
  }

  if (!runCount) {
    return (
      <div className='w-full flex items-center justify-end'>
        <Text.H5M userSelect={false} color='foregroundMuted' ellipsis noWrap>
          {evaluations.map((evaluation) => evaluation.name).join(' · ')}
        </Text.H5M>
      </div>
    )
  }

  return (
    <div className='w-full flex items-center justify-end gap-2'>
      {evaluations.length - count.skipped > 0 && (
        <Badge
          variant={
            count.passed
              ? count.passed >= (evaluations.length - count.skipped) / 2
                ? 'successMuted'
                : 'warningMuted'
              : 'destructiveMuted'
          }
        >
          {count.passed}/{evaluations.length - count.skipped} passed
        </Badge>
      )}
      {count.skipped > 0 && (
        <Badge variant='muted'>{count.skipped} skipped</Badge>
      )}
    </div>
  )
}

const useEvaluationResultsSocket = ({
  documentLog,
  evaluations,
  mutate,
}: {
  documentLog?: DocumentLogWithMetadata
  evaluations: ContentProps['evaluations']
  mutate: ReturnType<typeof useEvaluationResultsByDocumentLogs>['mutate']
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultCreated'>) => {
      if (!args.row || !documentLog) return
      if (args.row.documentLogId !== documentLog.id) return
      const evaluation = evaluations.find(
        (evaluation) =>
          evaluation.live && evaluation.id === args.row.evaluationId,
      )
      if (!evaluation) return

      mutate(
        (prev) => ({
          ...(prev ?? {}),
          [documentLog.id]: (prev?.[documentLog.id] ?? []).concat([
            { result: args.row, evaluation },
          ]),
        }),
        { revalidate: false },
      )
    },
    [documentLog, evaluations, mutate],
  )

  useSockets({ event: 'evaluationResultCreated', onMessage })
}

export default function Evaluations({
  documentLog,
  document,
  commit,
  runCount,
  onExpand,
  isLoading: isDocumentLogLoading,
}: {
  documentLog?: DocumentLogWithMetadata
  document: DocumentVersion
  commit: ICommitContextType['commit']
  runCount: number
  onExpand?: OnExpandFn
  isLoading: boolean
}) {
  const { project } = useCurrentProject()

  const { data: connectedEvaluations, isLoading: isEvaluationsLoading } =
    useConnectedEvaluations({
      documentUuid: document.documentUuid,
      projectId: project.id,
      commitUuid: commit.uuid,
    })
  const evaluations = useMemo(
    () =>
      connectedEvaluations.map(({ evaluation, live }) => ({
        ...evaluation,
        live,
      })),
    [connectedEvaluations],
  )

  const { data: evaluationResults, mutate } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: documentLog ? [documentLog.id] : [],
    })
  useEvaluationResultsSocket({ documentLog, evaluations, mutate })
  const results = useMemo(() => {
    if (!documentLog || !evaluationResults[documentLog.id]) return {}
    return evaluationResults[documentLog.id]!.reduce(
      (acc, { result }) => {
        acc[result.evaluationId] = result
        return acc
      },
      {} as ContentProps['results'],
    )
  }, [evaluationResults])

  const [awaitable, setAwaitable] = useState<{
    documentLog?: DocumentLogWithMetadata
    results: number
  }>({ results: 0 })
  useEffect(() => {
    if (!documentLog) return
    if (isDocumentLogLoading || isEvaluationsLoading) return
    if (awaitable.documentLog?.id === documentLog.id) return
    setAwaitable({
      documentLog: documentLog,
      results: evaluations.filter((evaluation) => evaluation.live).length,
    })
  }, [isDocumentLogLoading, documentLog, isEvaluationsLoading, evaluations])

  const isWaiting = useMemo(
    () =>
      (runCount > 0 && !documentLog) ||
      isDocumentLogLoading ||
      Object.values(results).filter(
        (result) => result.documentLogId === documentLog?.id,
      ).length < awaitable.results,
    [runCount, isDocumentLogLoading, documentLog, results, awaitable],
  )

  const contentProps = {
    results,
    evaluations,
    document,
    commit,
    project,
    runCount,
    isLoading: isEvaluationsLoading,
    isWaiting,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Evaluations'
        icon='listCheck'
        initialExpanded={false}
        collapsedContentHeader={<CollapsedContentHeader {...contentProps} />}
        expandedContent={<ExpandedContent {...contentProps} />}
        expandedContentHeader={<ExpandedContentHeader {...contentProps} />}
        onExpand={onExpand}
      />
    </ClientOnly>
  )
}
