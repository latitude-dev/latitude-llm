import { EvaluationRoutes, ROUTES } from '$/services/routes'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import useEvaluations from '$/stores/evaluations'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { useMemo } from 'react'

import {
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
  useCurrentProject,
  type ICommitContextType,
  type IProjectContextType,
} from '@latitude-data/web-ui'
import Link from 'next/link'

import LiveEvaluationToggle from '../../../../evaluations/[evaluationId]/_components/Actions/LiveEvaluationToggle'
import { ResultCellContent as OriginalResultCellContent } from '../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'

type ContentProps = {
  results: Record<number, EvaluationResultDto>
  evaluations: EvaluationDto[]
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  isLoading: boolean
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

function EvaluationItem({
  result,
  evaluation,
  document,
  commit,
  project,
}: {
  result?: EvaluationResultDto
  evaluation: EvaluationDto
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
}) {
  const query = new URLSearchParams()
  query.set(
    'back',
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).root,
  )
  if (result?.evaluatedProviderLogId) {
    query.set('providerLogId', result.evaluatedProviderLogId.toString())
  }

  const route =
    ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
      EvaluationRoutes.editor
    ].root + `?${query.toString()}`

  return (
    <div className='h-32 flex flex-col flex-grow basis-60 flex-shrink items-center justify-start gap-2 border p-4 rounded-lg overflow-hidden'>
      <div className='flex flex-row items-center justify-between gap-2 w-full'>
        <Text.H5 userSelect={false} ellipsis noWrap>
          {evaluation.name}
        </Text.H5>
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
      <div className='w-full h-full'>
        <Text.H6
          userSelect={false}
          color='foregroundMuted'
          lineHeight='h5'
          wordBreak='breakAll'
          ellipsis
          lineClamp={3}
        >
          {result ? (
            <span className='space-x-1.5'>
              <ResultCellContent result={result} evaluation={evaluation} />
              <Tooltip asChild trigger={<span>{result.reason}</span>}>
                {result.reason}
              </Tooltip>
            </span>
          ) : (
            evaluation.description
          )}
        </Text.H6>
      </div>
    </div>
  )
}

function ExpandedContent({
  results,
  evaluations,
  document,
  commit,
  project,
  isLoading,
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
          document={document}
          commit={commit}
          project={project}
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
  isLoading,
}: ContentProps) {
  const count = useMemo(() => {
    return evaluations.reduce(
      (acc, evaluation) => {
        // TODO: Change for real skipped condition
        if (evaluation.description) acc.skipped++

        const result = results[evaluation.id]
        if (!result || result.result === undefined) return acc

        if (evaluation.resultType === EvaluationResultableType.Boolean) {
          const value =
            typeof result.result === 'string'
              ? result.result === 'true'
              : Boolean(result.result)
          return value ? { ...acc, passed: acc.passed + 1 } : acc
        }

        if (evaluation.resultType === EvaluationResultableType.Number) {
          const value = Number(result.result)
          return value >= evaluation.resultConfiguration.maxValue
            ? { ...acc, passed: acc.passed + 1 }
            : acc
        }

        return { ...acc, passed: acc.passed + 1 }
      },
      { passed: 0, skipped: 0 },
    )
  }, [results, evaluations])

  if (isLoading) {
    return (
      <div className='w-full flex items-center justify-end'>
        <Skeleton className='w-36 h-4' />
      </div>
    )
  }

  if (!Object.keys(results).length) {
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
      <Badge
        variant={
          count.passed
            ? count.passed >= evaluations.length / 2
              ? 'successMuted'
              : 'warningMuted'
            : 'destructiveMuted'
        }
      >
        {count.passed}/{evaluations.length} passed
      </Badge>
      {count.skipped > 0 && (
        <Badge variant='muted'>{count.skipped} skipped</Badge>
      )}
    </div>
  )
}

export default function Evaluations({
  log,
  document,
  commit,
  onExpand,
}: {
  log?: DocumentLogWithMetadata
  document: DocumentVersion
  commit: ICommitContextType['commit']
  onExpand?: OnExpandFn
}) {
  const { project } = useCurrentProject()
  // TODO: Use ConnectedEvaluations with evaluation details (EvaluationDto)
  const { data: evaluations, isLoading: isEvaluationsLoading } = useEvaluations(
    {
      params: { documentUuid: document.documentUuid },
    },
  )
  // TODO: Fix, this does not automatically update when evaluation is updated
  const { data: evaluationResults, isLoading: isEvaluationResultsLoading } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: log ? [log.id] : [],
    })
  const results = useMemo(() => {
    console.log(evaluationResults)
    if (!log || !evaluationResults[log.id]) return {}
    return evaluationResults[log.id]!.reduce(
      (acc, { result }) => {
        acc[result.evaluationId] = result
        return acc
      },
      {} as Record<number, EvaluationResultDto>,
    )
  }, [evaluationResults, log])

  const contentProps = {
    results,
    evaluations,
    document,
    commit,
    project,
    // TODO: When we have the connected info we can just wait for the live evals to load their results
    isLoading: isEvaluationsLoading || isEvaluationResultsLoading,
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
