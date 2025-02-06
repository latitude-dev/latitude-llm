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
  isEvaluationsLoading: boolean
  isEvaluationResultsLoading: boolean
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

function EvaluationItemResult({
  result,
  evaluation,
}: {
  result?: EvaluationResultDto
  evaluation: EvaluationDto
}) {
  if (!result) {
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

  return (
    <div className='w-full h-full'>
      <Text.H6
        userSelect={false}
        color='foregroundMuted'
        lineHeight='h5'
        wordBreak='breakAll'
        ellipsis
        lineClamp={3}
      >
        <span className='space-x-1.5'>
          <ResultCellContent result={result} evaluation={evaluation} />
          <Tooltip asChild trigger={<span>{result.reason}</span>}>
            {result.reason}
          </Tooltip>
        </span>
      </Text.H6>
    </div>
  )
}

function EvaluationItem({
  result,
  evaluation,
  document,
  commit,
  project,
  isResultLoading,
}: {
  result?: EvaluationResultDto
  evaluation: EvaluationDto
  document: DocumentVersion
  commit: ICommitContextType['commit']
  project: IProjectContextType['project']
  isResultLoading: boolean
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
        {isResultLoading ? (
          <Skeleton className='h-full w-full' />
        ) : (
          <EvaluationItemResult result={result} evaluation={evaluation} />
        )}
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
  isEvaluationsLoading,
  isEvaluationResultsLoading,
}: ContentProps) {
  if (isEvaluationsLoading) {
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
          isResultLoading={isEvaluationResultsLoading}
        />
      ))}
    </div>
  )
}

// TODO: Fix header overflows
function ExpandedContentHeader({ document, commit, project }: ContentProps) {
  const route = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

  return (
    <div className='w-full flex items-center justify-center'>
      <Link href={route}>
        <Button variant='link'>+ Connect an evaluation</Button>
      </Link>
    </div>
  )
}

// TODO: Fix header overflows
function CollapsedContentHeader({
  evaluations,
  isEvaluationsLoading,
}: ContentProps) {
  return (
    <div className='w-full flex items-center justify-center gap-4 pr-3 truncate'>
      {isEvaluationsLoading ? (
        <Skeleton className='w-36 h-4' />
      ) : (
        <Text.H5M userSelect={false} color='foregroundMuted' ellipsis noWrap>
          {evaluations.map((evaluation) => evaluation.name).join(' · ')}
        </Text.H5M>
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
    isEvaluationsLoading,
    isEvaluationResultsLoading,
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
