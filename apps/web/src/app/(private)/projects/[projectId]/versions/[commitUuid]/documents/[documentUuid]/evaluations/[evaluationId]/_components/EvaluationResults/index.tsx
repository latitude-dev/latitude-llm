'use client'

import { useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { useProviderLog } from '$/stores/providerLogs'
import Link from 'next/link'

import { EvaluationResultInfo } from './EvaluationResultInfo'
import { EvaluationResultsTable } from './EvaluationResultsTable'
import { EvaluationStatusBanner } from './EvaluationStatusBanner'

export function EvaluationResults({
  evaluation,
  evaluationResults,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadata[]
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadata | undefined
  >(undefined)
  const { data: providerLog } = useProviderLog(selectedResult?.providerLogId)
  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner evaluation={evaluation} />
      <div className='flex flex-row w-full h-full overflow-hidden gap-4'>
        <div className='flex-grow min-w-0 h-full'>
          {evaluationResults.length === 0 && (
            <TableBlankSlate
              description='There are no evaluation results yet. Run the evaluation or, if you already have, wait a few seconds for the first results to stream in.'
              link={
                <Link
                  href={
                    ROUTES.projects
                      .detail({ id: project.id })
                      .commits.detail({ uuid: commit.uuid })
                      .documents.detail({ uuid: document.documentUuid })
                      [DocumentRoutes.evaluations].detail(evaluation.id)
                      .createBatch
                  }
                >
                  <TableBlankSlate.Button>
                    Run the evaluation
                  </TableBlankSlate.Button>
                </Link>
              }
            />
          )}
          {evaluationResults.length > 0 && (
            <EvaluationResultsTable
              evaluation={evaluation}
              evaluationResults={evaluationResults}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
            />
          )}
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
