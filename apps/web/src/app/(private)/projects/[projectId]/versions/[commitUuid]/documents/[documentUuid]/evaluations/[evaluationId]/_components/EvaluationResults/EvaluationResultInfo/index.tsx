'use client'

import { useState } from 'react'

import { ProviderLogDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import { TabSelector } from '@latitude-data/web-ui'

import { EvaluationResultMessages } from './Messages'
import { EvaluationResultMetadata } from './Metadata'

export function EvaluationResultInfo({
  evaluationResult,
  providerLog,
}: {
  evaluationResult: EvaluationResultWithMetadata
  providerLog?: ProviderLogDto
}) {
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  return (
    <div className='w-80 flex-shrink-0 flex flex-col border border-border rounded-lg px-4 pt-6 items-center'>
      <TabSelector
        options={[
          { label: 'Metadata', value: 'metadata' },
          { label: 'Messages', value: 'messages' },
        ]}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      <div className='flex relative w-full h-full max-h-full max-w-full overflow-auto'>
        {selectedTab === 'metadata' && (
          <EvaluationResultMetadata
            evaluationResult={evaluationResult}
            providerLog={providerLog}
          />
        )}
        {selectedTab === 'messages' && (
          <EvaluationResultMessages providerLog={providerLog} />
        )}
      </div>
    </div>
  )
}
