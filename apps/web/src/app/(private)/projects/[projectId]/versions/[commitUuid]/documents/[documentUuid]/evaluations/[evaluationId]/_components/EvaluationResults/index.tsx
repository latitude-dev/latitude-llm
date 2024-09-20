'use client'

import { useEffect, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  Text,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import useEvaluationResultsWithMetadata from '$/stores/evaluationResultsWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'

import { EvaluationResultInfo } from './EvaluationResultInfo'
import { EvaluationResultsTable } from './EvaluationResultsTable'
import { EvaluationStatusBanner } from './EvaluationStatusBanner'

const FIVE_SECONDS = 5000

export function EvaluationResults({
  evaluation,
  evaluationResults: serverData,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadata | undefined
  >(undefined)
  const document = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: evaluationResults, mutate } = useEvaluationResultsWithMetadata(
    {
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: serverData,
    },
  )

  useEffect(() => {
    const interval = setInterval(() => {
      mutate()
    }, FIVE_SECONDS)

    return () => clearInterval(interval)
  }, [mutate])

  const { data: providerLog } = useProviderLog(selectedResult?.providerLogId)
  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner evaluation={evaluation} />
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
            evaluation={evaluation}
            evaluationResult={selectedResult}
            providerLog={providerLog}
          />
        )}
      </div>
    </div>
  )
}
