'use client'

import { DocumentLogMessages } from '$/components/DocumentLogMessages'
import { MetadataItem } from '$/components/MetadataItem'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import {
  buildConversation,
  DocumentLogWithMetadataAndError,
  ProviderLogDto,
  ResultWithEvaluationV2,
  SpanWithDetails,
} from '@latitude-data/core/browser'
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
  children,
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
  stickyRef?: RefObject<HTMLTableElement>
  sidebarWrapperRef?: RefObject<HTMLDivElement>
  children?: ReactNode
  bottomActions?: ReactNode
  offset?: StickyOffset
  span?: SpanWithDetails
  isSpanLoading?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)

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
    const providerLog = providerLogs?.at(-1)
    if (!providerLog) return []
    return buildConversation(providerLog)
  }, [providerLogs])

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
                {children}
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
