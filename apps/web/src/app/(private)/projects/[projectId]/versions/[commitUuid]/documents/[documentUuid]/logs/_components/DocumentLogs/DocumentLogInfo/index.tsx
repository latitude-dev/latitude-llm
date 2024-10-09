'use client'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { Alert } from '@latitude-data/web-ui'

import { MetadataInfoTabs } from '../../../../_components/MetadataInfoTabs'
import { MetadataItem } from '../../../../../[documentUuid]/_components/MetadataItem'
import { DocumentLogMessages } from './Messages'
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
}: {
  documentLog: DocumentLogWithMetadataAndError
  providerLogs?: ProviderLogDto[]
  isLoading?: boolean
  error?: Error
  className?: string
}) {
  return (
    <MetadataInfoTabs className={className}>
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
                  />
                )}
                {selectedTab === 'messages' && (
                  <DocumentLogMessages providerLogs={providerLogs} />
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
