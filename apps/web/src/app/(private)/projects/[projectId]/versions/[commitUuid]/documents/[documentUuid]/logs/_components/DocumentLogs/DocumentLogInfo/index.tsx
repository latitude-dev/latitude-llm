'use client'

import { useState } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { Alert, TabSelector } from '@latitude-data/web-ui'

import { DocumentLogMessages } from './Messages'
import { DocumentLogMetadata, MetadataItem } from './Metadata'

function DocumentLogMetadataLoading() {
  return (
    <div className='flex flex-col gap-6 py-6 w-full'>
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
  isLoading = false,
  error,
}: {
  documentLog: DocumentLogWithMetadata
  providerLogs?: ProviderLogDto[]
  isLoading?: boolean
  error?: Error
}) {
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  return (
    <>
      <TabSelector
        options={[
          { label: 'Metadata', value: 'metadata' },
          { label: 'Messages', value: 'messages' },
        ]}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      <div className='flex relative w-full h-full max-h-full max-w-full overflow-auto'>
        {isLoading ? (
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
        )}
      </div>
    </>
  )
}
