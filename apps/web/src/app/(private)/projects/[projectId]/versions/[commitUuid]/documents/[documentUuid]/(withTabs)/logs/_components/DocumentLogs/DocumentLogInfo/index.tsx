'use client'

import { DocumentLogMessages } from '$/components/DocumentLogMessages'
import { MetadataItem } from '$/components/MetadataItem'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { useProviderLog } from '$/stores/providerLogs'
import {
  DocumentLogWithMetadataAndError,
  EvaluationType,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/core/constants'
import { buildConversation } from '@latitude-data/core/helpers'
import {
  ProviderLogDto,
  ResultWithEvaluationV2,
} from '@latitude-data/core/schema/types'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DEFAULT_TABS,
  MetadataInfoTabs,
} from '../../../../../_components/MetadataInfoTabs'
import { DocumentLogEvaluations } from './Evaluations'
import { DocumentLogMetadata } from './Metadata'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'

function DocumentLogMetadataLoading() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Log uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Tokens' loading />
      <MetadataItem label='Cost' loading />
      <MetadataItem label='Duration' loading />
      <MetadataItem label='Version' loading />
    </div>
  )
}

export function DocumentLogInfo({
  documentLog,
  providerLogs,
  evaluationResults,
  isLoading = false,
  error,
  className,
  stickyRef,
  sidebarWrapperRef,
  bottomActions,
  offset,
  span,
  isSpanLoading,
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  evaluationResults?: ResultWithEvaluationV2[]
  isLoading?: boolean
  error?: Error
  className?: string
  stickyRef?: RefObject<HTMLTableElement | null>
  sidebarWrapperRef?: RefObject<HTMLDivElement | null>
  bottomActions?: ReactNode
  offset?: StickyOffset
  span?: SpanWithDetails
  isSpanLoading?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const { data: providerLog } = useProviderLog(providerLogs?.at(-1)?.id)

  useEffect(() => {
    if (!ref.current) return

    setTarget(ref.current)
  }, [])
  const scrollableArea = usePanelDomRef({ selfRef: target })
  const beacon = stickyRef?.current
  useStickyNested({
    scrollableArea,
    beacon,
    target,
    targetContainer: sidebarWrapperRef?.current,
    offset: offset ?? { top: 0, bottom: 0 },
  })

  const conversation = useMemo(() => {
    if (!providerLog) return []

    return buildConversation(providerLog)
  }, [providerLog])

  return (
    <MetadataInfoTabs
      ref={ref}
      className={className}
      bottomActions={bottomActions}
      tabs={
        evaluationResults
          ? [...DEFAULT_TABS, { label: 'Evaluations', value: 'evaluations' }]
          : DEFAULT_TABS
      }
    >
      {({ selectedTab }) =>
        isLoading ? (
          <DocumentLogMetadataLoading />
        ) : (
          <>
            {!error ? (
              <>
                {selectedTab === 'metadata' && (
                  <DocumentLogMetadata
                    documentLog={documentLog}
                    providerLogs={providerLogs}
                    lastResponse={conversation.at(-1)}
                    span={span}
                    isSpanLoading={isSpanLoading}
                  />
                )}
                {selectedTab === 'messages' && (
                  <DocumentLogMessages
                    documentLogParameters={documentLog.parameters}
                    messages={conversation}
                  />
                )}
                {selectedTab === 'evaluations' && (
                  <DocumentLogEvaluations
                    evaluationResults={evaluationResults}
                    commit={documentLog.commit}
                    documentLog={documentLog}
                  />
                )}
                {span && <AnnotationForms span={span} />}
              </>
            ) : (
              <Alert
                variant='destructive'
                title='Error loading'
                description={error.message}
              />
            )}
          </>
        )
      }
    </MetadataInfoTabs>
  )
}

export function AnnotationForms({ span }: { span: SpanWithDetails }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { data: evaluations } = useEvaluationsV2({ project, commit, document })
  const { data: evaluationResultsBySpan } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId: span?.id,
    traceId: span?.traceId,
  })
  const humanEvals = evaluations.filter((e) => e.type === EvaluationType.Human)
  if (span.type !== SpanType.Prompt) return null

  return (
    humanEvals.length > 0 &&
    !!span && (
      <div className='w-full border-t flex flex-col gap-y-4 mt-4 pt-4'>
        {humanEvals.map((evaluation) => (
          <AnnotationForm
            key={evaluation.uuid}
            evaluation={evaluation}
            span={span as SpanWithDetails<SpanType.Prompt>}
            result={
              evaluationResultsBySpan.find(
                (result) => result.evaluation.uuid === evaluation.uuid,
              )?.result
            }
          />
        ))}
      </div>
    )
  )
}
