'use client'

import { useCallback, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { type EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useToggleModal } from '$/hooks/useToogleModal'
import useEvaluationResultsWithMetadata from '$/stores/evaluationResultsWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'
import { useSearchParams } from 'next/navigation'

import CreateBatchEvaluationModal from '../Actions/CreateBatchEvaluationModal'
import { EvaluationResultInfo } from './EvaluationResultInfo'
import {
  EvaluationResultRow,
  EvaluationResultsTable,
} from './EvaluationResultsTable'
import { EvaluationStatusBanner } from './EvaluationStatusBanner'

const useEvaluationResultsSocket = (
  evaluation: EvaluationDto,
  document: { documentUuid: string },
  mutate: ReturnType<typeof useEvaluationResultsWithMetadata>['mutate'],
) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultCreated'>) => {
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

      setTimeout(() => {
        mutate(
          (prevData) => {
            return prevData?.map((row) => {
              if (
                row.id === args.row.id &&
                (row as EvaluationResultRow).realtimeAdded
              ) {
                const { realtimeAdded: _, ...rest } = row as EvaluationResultRow
                return rest
              }
              return row
            })
          },
          { revalidate: false },
        )
      }, 1000)
    },
    [evaluation.id, document.documentUuid, mutate],
  )

  useSockets({ event: 'evaluationResultCreated', onMessage })
}

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
  const { open, onClose, onOpen } = useToggleModal()
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

  useEvaluationResultsSocket(evaluation, document, mutate)

  return (
    <div className='flex flex-col gap-4'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner
        documentUuid={document.documentUuid}
        evaluationId={evaluation.id}
      />
      <div className='relative flex flex-row w-full gap-4 overflow-x-auto min-w-[1024px]'>
        <div className='flex-1'>
          {evaluationResults.length === 0 && (
            <TableBlankSlate
              description='There are no evaluation results yet. Run the evaluation or, if you already have, wait a few seconds for the first results to stream in.'
              link={
                <TableBlankSlate.Button onClick={onOpen}>
                  Run the evaluation
                </TableBlankSlate.Button>
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
          <div className='lg:w-1/2 2xl:w-1/3'>
            <EvaluationResultInfo
              key={selectedResult.id}
              evaluation={evaluation}
              evaluationResult={selectedResult}
              providerLog={providerLog}
            />
          </div>
        )}
      </div>
      <CreateBatchEvaluationModal
        open={open}
        onClose={onClose}
        document={document}
        evaluation={evaluation}
        projectId={project.id.toString()}
        commitUuid={commit.uuid}
      />
    </div>
  )
}
