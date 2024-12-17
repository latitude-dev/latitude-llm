'use client'

import {
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadataAndError,
  ResultWithEvaluation,
} from '@latitude-data/core/repositories'
import {
  Alert,
  Button,
  Tooltip,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'

import {
  DEFAULT_TABS,
  MetadataInfoTabs,
} from '../../../../_components/MetadataInfoTabs'
import { MetadataItem } from '../../../../../[documentUuid]/_components/MetadataItem'
import { DocumentLogEvaluations } from './Evaluations'
import { DocumentLogMessages, useGetProviderLogMessages } from './Messages'
import { DocumentLogMetadata } from './Metadata'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

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

function UseDocumentLogInPlaygroundButton({
  documentLog,
}: {
  documentLog: DocumentLogWithMetadataAndError
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const documentUuid = documentLog.documentUuid
  const { document } = useCurrentDocument()
  const {
    setSource,
    history: { setHistoryLog },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const navigate = useRouter()
  const employLogAsDocumentParameters = useCallback(() => {
    setSource('history')
    setHistoryLog(documentLog.uuid)
    navigate.push(
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({
          uuid: commit.uuid,
        })
        .documents.detail({ uuid: documentUuid }).root,
    )
  }, [
    setHistoryLog,
    setSource,
    navigate,
    project.id,
    commit.uuid,
    documentUuid,
    documentLog.uuid,
  ])
  const hasError = !!documentLog.error.message

  if (hasError) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          onClick={employLogAsDocumentParameters}
          fancy
          iconProps={{ name: 'rollText', color: 'foregroundMuted' }}
          variant='outline'
          size='icon'
          containerClassName='rounded-xl pointer-events-auto'
          className='rounded-xl'
        />
      }
    >
      Use this log in the playground
    </Tooltip>
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
  offset,
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  evaluationResults?: ResultWithEvaluation[]
  isLoading?: boolean
  error?: Error
  className?: string
  stickyRef?: RefObject<HTMLTableElement>
  sidebarWrapperRef?: RefObject<HTMLDivElement>
  children?: ReactNode
  offset?: StickyOffset
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return

    setTarget(ref.current)
  }, [ref.current])
  const scrollableArea = usePanelDomRef({ selfRef: target })
  const beacon = stickyRef?.current
  useStickyNested({
    scrollableArea,
    beacon,
    target,
    targetContainer: sidebarWrapperRef?.current,
    offset: offset ?? { top: 0, bottom: 0 },
  })

  const { lastResponse, messages } = useGetProviderLogMessages({ providerLogs })
  return (
    <MetadataInfoTabs
      ref={ref}
      className={className}
      bottomActions={children}
      tabs={
        evaluationResults
          ? [...DEFAULT_TABS, { label: 'Evaluations', value: 'evaluations' }]
          : DEFAULT_TABS
      }
      tabsActions={
        <>
          {documentLog ? (
            <UseDocumentLogInPlaygroundButton documentLog={documentLog} />
          ) : null}
        </>
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
                    lastResponse={lastResponse}
                  />
                )}
                {selectedTab === 'messages' && (
                  <DocumentLogMessages
                    documentLog={documentLog}
                    messages={messages}
                  />
                )}
                {selectedTab === 'evaluations' && (
                  <DocumentLogEvaluations
                    evaluationResults={evaluationResults}
                  />
                )}
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
