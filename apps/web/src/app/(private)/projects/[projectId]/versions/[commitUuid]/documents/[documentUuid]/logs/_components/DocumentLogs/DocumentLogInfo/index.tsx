'use client'

import {
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import {
  buildConversation,
  ProviderLogDto,
  ResultWithEvaluationTmp,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'
import { DocumentLogMessages } from '$/components/DocumentLogMessages'
import { MetadataItem } from '$/components/MetadataItem'
import {
  DEFAULT_TABS,
  MetadataInfoTabs,
} from '../../../../_components/MetadataInfoTabs'
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
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  evaluationResults?: ResultWithEvaluationTmp[]
  isLoading?: boolean
  error?: Error
  className?: string
  stickyRef?: RefObject<HTMLTableElement>
  sidebarWrapperRef?: RefObject<HTMLDivElement>
  children?: ReactNode
  bottomActions?: ReactNode
  offset?: StickyOffset
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
