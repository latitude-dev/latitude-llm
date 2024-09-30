'use client'

import { useRef, useState } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { Alert, cn, TabSelector } from '@latitude-data/web-ui'
import useDynamicHeight from '$/hooks/useDynamicHeight'

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
  className,
}: {
  documentLog: DocumentLogWithMetadata
  providerLogs?: ProviderLogDto[]
  isLoading?: boolean
  error?: Error
  className?: string
}) {
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  const ref = useRef<HTMLDivElement>(null)
  const height = useDynamicHeight({ ref, paddingBottom: 16 })
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex-shrink-0 flex flex-col',
        'border border-border rounded-lg items-center custom-scrollbar overflow-y-auto',
        className,
      )}
      style={{
        maxHeight: height ? `${height}px` : 'auto',
      }}
    >
      <div className='z-10 w-full sticky top-0 px-4 bg-white flex justify-center'>
        <div className='pt-6'>
          <TabSelector
            options={[
              { label: 'Metadata', value: 'metadata' },
              { label: 'Messages', value: 'messages' },
            ]}
            selected={selectedTab}
            onSelect={setSelectedTab}
          />
        </div>
      </div>
      <div className='px-4 flex relative w-full h-full max-w-full'>
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
    </div>
  )
}
