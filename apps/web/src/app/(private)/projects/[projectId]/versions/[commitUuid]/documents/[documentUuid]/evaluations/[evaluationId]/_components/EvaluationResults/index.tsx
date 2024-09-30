'use client'

import { useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { type EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import useEvaluationResultsWithMetadata from '$/stores/evaluationResultsWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { EvaluationResultInfo } from './EvaluationResultInfo'
import { EvaluationResultsTable } from './EvaluationResultsTable'
import { EvaluationStatusBanner } from './EvaluationStatusBanner'

export function EvaluationResults({
  evaluation,
  evaluationResults: serverData,
  pagination,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadata[]
  pagination: IPagination
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadata | undefined
  >(undefined)
  const { data: providerLog } = useProviderLog(selectedResult?.providerLogId)
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const { data: evaluationResults, mutate } = useEvaluationResultsWithMetadata(
    {
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page,
      pageSize,
    },
    {
      fallbackData: serverData,
    },
  )
  const onMessage = (args: EventArgs<'evaluationResultCreated'>) => {
    if (evaluation.id !== args.evaluationId) return
    if (document.documentUuid !== args.documentUuid) return

    const createdAt = new Date(args.row.createdAt)
    mutate(
      (prevData) => {
        return [
          { ...args.row, createdAt, realtimeAdded: true },
          ...(prevData ?? []),
        ]
      },
      { revalidate: false },
    )
  }

  useSockets({ event: 'evaluationResultCreated', onMessage })

  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner
        documentUuid={document.documentUuid}
        evaluationId={evaluation.id}
      />
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
              pagination={pagination}
            />
          )}
        </div>
        {selectedResult && (
          <EvaluationResultInfo
            key={selectedResult.id}
            evaluation={evaluation}
            evaluationResult={selectedResult}
            providerLog={providerLog}
          />
        )}
      </div>
    </div>
  )
}
