import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import {
  DocumentVersion,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { MetadataInfoTabs } from '../../../_components/MetadataInfoTabs'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageList } from '$/components/ChatWrapper'
import { adaptPromptlMessageToLegacy } from '@latitude-data/core/utils/promptlAdapter'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/findFirstSpanOfType'
import { AnnotationForms } from '../../logs/_components/DocumentLogs/DocumentLogInfo'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  IProjectContextType,
  useCurrentProject,
} from '$/app/providers/ProjectProvider'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import Link from 'next/link'
import { useSpan } from '$/stores/spans'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import { MetadataItem } from '$/components/MetadataItem'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { ROUTES } from '$/services/routes'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
]

export function TraceInfo() {
  const { selection } = useTraceSpanSelection()
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: results } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId: selection.spanId!,
    traceId: selection.traceId!,
  })

  const tabs =
    results.length > 0
      ? [...DEFAULT_TABS, { label: 'Evaluations', value: 'evaluations' }]
      : DEFAULT_TABS

  return (
    <div className='flex flex-col gap-4'>
      <MetadataInfoTabs tabs={tabs}>
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && <TraceMetadata />}
            {selectedTab === 'messages' && <TraceMessages />}
            {selectedTab === 'evaluations' && <TraceEvaluations />}
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}

function TraceMetadata() {
  const { selection } = useTraceSpanSelection()
  const { data: span, isLoading } = useSpan({
    spanId: selection.spanId,
    traceId: selection.traceId,
  })
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  return (
    <div className='flex flex-col gap-4'>
      <DetailsPanel span={span} />
      <AnnotationForms span={span as SpanWithDetails<SpanType.Prompt>} />
    </div>
  )
}

function TraceMessages() {
  const { selection } = useTraceSpanSelection()
  const { data: trace } = useTrace({ traceId: selection.traceId! })
  const completionSpan = findFirstSpanOfType(
    trace?.children ?? [],
    SpanType.Completion,
  )
  if (!completionSpan) return null

  const promptSpan = findFirstSpanOfType(trace?.children ?? [], SpanType.Prompt)
  const completionMetadata = completionSpan?.metadata
  const promptMetadata = promptSpan?.metadata
  const legacyMessages = [
    ...(completionMetadata?.input || []).map(adaptPromptlMessageToLegacy),
    ...(completionMetadata?.output || []).map(adaptPromptlMessageToLegacy),
  ]
  if (!legacyMessages.length) {
    return (
      <div className='flex flex-row items-center justify-center w-full'>
        <Text.H6M color='foregroundMuted'>No messages</Text.H6M>{' '}
      </div>
    )
  }

  return (
    <MessageList
      debugMode
      messages={legacyMessages}
      parameters={
        promptMetadata?.parameters
          ? Object.keys(promptMetadata.parameters)
          : undefined
      }
    />
  )
}

export function TraceEvaluations() {
  const { selection } = useTraceSpanSelection()
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: span } = useSpan({
    spanId: selection.spanId,
    traceId: selection.traceId,
  })
  const { data: evaluationResults } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId: selection.spanId!,
    traceId: selection.traceId!,
  })
  const getEvaluationV2Url = useEvaluationEditorLink({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

  if (!evaluationResults.length) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          There are no evaluation results for this log
        </Text.H5>
      </div>
    )
  }

  return (
    <ul className='flex flex-col gap-4 divide-y divide-border'>
      {evaluationResults.map((item) => (
        <li
          key={item.result.uuid}
          className='flex flex-col gap-2 pt-4 first:pt-0'
        >
          <span className='flex justify-between items-center gap-2 w-full'>
            <span className='flex justify-center items-center gap-1.5'>
              <Icon
                name={getEvaluationMetricSpecification(item.evaluation).icon}
                color='foreground'
                className='flex-shrink-0'
              />
              <Text.H4M noWrap ellipsis>
                {item.evaluation.name}
              </Text.H4M>
            </span>
            <Link
              href={getEvaluationV2Url({
                evaluationUuid: item.evaluation.uuid,
                documentLogUuid: span?.documentLogUuid,
              })}
              target='_blank'
            >
              <Button
                variant='link'
                iconProps={{
                  name: 'externalLink',
                  widthClass: 'w-4',
                  heightClass: 'h-4',
                  placement: 'right',
                }}
              >
                Edit
              </Button>
            </Link>
          </span>
          <div className='flex flex-col gap-2.5'>
            <TraceEvaluation
              project={project}
              commit={commit}
              document={document}
              {...item}
            />
          </div>
          <div className='w-full flex justify-start pt-2'>
            <Link
              href={EvaluatedLogLinkV2({
                project: project,
                commit: commit,
                document: document,
                ...item,
              })}
              target='_blank'
            >
              <Button variant='outline' fancy>
                View log
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

function EvaluatedLogLinkV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ result, evaluation, project, commit, document }: Props<T, M>) {
  const query = new URLSearchParams()
  query.set('resultUuid', result.uuid)

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail({ uuid: evaluation.uuid }).root +
    `?${query.toString()}`
  )
}

type Props<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = ResultWithEvaluationV2<T, M> & {
  project: IProjectContextType['project']
  commit: Commit
  document: DocumentVersion
}

function TraceEvaluation<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ result, evaluation }: Props<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) return null

  return (
    <>
      <MetadataItem label='Type' value={typeSpecification.name} />
      <MetadataItem label='Metric' value={metricSpecification.name} />
      {result.error ? (
        <MetadataItem
          label='Error'
          value={result.error.message}
          color='destructiveMutedForeground'
          stacked
        />
      ) : (
        <>
          <MetadataItem label='Result'>
            <ResultBadge evaluation={evaluation} result={result} />
          </MetadataItem>
          <MetadataItem
            label='Reasoning'
            value={
              metricSpecification.resultReason(
                result as EvaluationResultSuccessValue<T, M>,
              ) || 'No reason reported'
            }
            stacked
            collapsible
          />
        </>
      )}
    </>
  )
}
