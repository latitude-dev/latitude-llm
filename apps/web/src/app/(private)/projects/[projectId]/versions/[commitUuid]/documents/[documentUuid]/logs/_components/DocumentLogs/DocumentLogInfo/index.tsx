'use client'

import { RefObject, useEffect, useRef, useState } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui'
import { useStickyNested } from '$/hooks/useStickyNested'
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
  useStickyNested({
    scrollableArea,
    beacon,
    target,
    targetContainer: sidebarWrapperRef?.current,
    offset: 24,
  })
  const { lastResponse, messages } = useGetProviderLogMessages({ providerLogs })
  return (
    <MetadataInfoTabs ref={ref} className={className}>
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
