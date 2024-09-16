'use client'

import { useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import { Text } from '@latitude-data/web-ui'
import { useProviderLog } from '$/stores/providerLogs'

import { EvaluationResultInfo } from './EvaluationResultInfo'
import { EvaluationResultsTable } from './EvaluationResultsTable'

export function EvaluationResults({
  evaluation,
  evaluationResults,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadata | undefined
  >(undefined)

  const { data: providerLog } = useProviderLog(selectedResult?.providerLogId)
  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>Evaluation Results</Text.H4>
      <div className='flex flex-row w-full h-full overflow-hidden gap-4'>
        <div className='flex-grow min-w-0 h-full'>
          <EvaluationResultsTable
            evaluation={evaluation}
            evaluationResults={evaluationResults}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
          />
        </div>
        {selectedResult && (
          <EvaluationResultInfo
            evaluationResult={selectedResult}
            providerLog={providerLog}
          />
        )}
      </div>
    </div>
  )
}
