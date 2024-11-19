'use client'

import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import {
  Alert,
  Button,
  Tooltip,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useStickyNested } from '$/hooks/useStickyNested'
import { ROUTES } from '$/services/routes'
import { useRouter } from 'next/navigation'
import { usePanelDomRef } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/SplitPane'

import { MetadataInfoTabs } from '../../../../_components/MetadataInfoTabs'
import { MetadataItem } from '../../../../../[documentUuid]/_components/MetadataItem'
import { DocumentLogMessages, useGetProviderLogMessages } from './Messages'
import { DocumentLogMetadata } from './Metadata'

function DocumentLogMetadataLoading() {
  return (
    <>
      <MetadataItem label='Log uuid' loading />
      <MetadataItem label='Timestamp' loading />
      <MetadataItem label='Tokens' loading />
      <MetadataItem label='Cost' loading />
      <MetadataItem label='Duration' loading />
      <MetadataItem label='Version' loading />
    </>
  )
}

export function DocumentLogInfo({
  documentLog,
  providerLogs,
  isLoading = false,
  error,
  className,
  tableRef,
  sidebarWrapperRef,
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  isLoading?: boolean
  error?: Error
  className?: string
  tableRef?: RefObject<HTMLTableElement>
  sidebarWrapperRef?: RefObject<HTMLDivElement>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!ref.current) return

    setTarget(ref.current)
  }, [ref.current])
  const scrollableArea = usePanelDomRef({ selfRef: target })
  const beacon = tableRef?.current
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const {
    setSource,
    history: { setHistoryLog },
  } = useDocumentParameters({
    documentVersionUuid: documentLog.documentUuid,
    commitVersionUuid: commit.uuid,
  })
  useStickyNested({
    scrollableArea,
    beacon,
    target,
    targetContainer: sidebarWrapperRef?.current,
    offset: 24,
  })
  const { lastResponse, messages } = useGetProviderLogMessages({ providerLogs })
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
        .documents.detail({ uuid: documentLog.documentUuid }).root,
    )
  }, [
    setHistoryLog,
    setSource,
    navigate,
    project.id,
    commit.uuid,
    documentLog.documentUuid,
    documentLog.uuid,
  ])
  return (
    <MetadataInfoTabs
      ref={ref}
      className={className}
      tabsActions={
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
                  <DocumentLogMessages messages={messages} />
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
