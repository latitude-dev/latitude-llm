'use client'

import { useCallback, useRef, useState } from 'react'

import { EvaluationDto } from '@latitude-data/core/browser'
import { type EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import {
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
import { EvaluationBlankSlate } from './EvaluationBlankSlate'
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
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadataAndErrors[]
}) {
  const tabelRef = useRef<HTMLTableElement | null>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadataAndErrors | undefined
  >(undefined)
  const { open, onClose, onOpen } = useToggleModal()
  const { data: providerLog } = useProviderLog(
    selectedResult?.evaluationProviderLogId,
  )
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
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner
        documentUuid={document.documentUuid}
        evaluationId={evaluation.id}
      />
      <div className='flex flex-row flex-grow gap-4 min-w-[1024px]'>
        <div className='flex-1 mb-6'>
          {evaluationResults.length === 0 && (
            <EvaluationBlankSlate evaluation={evaluation} onOpen={onOpen} />
          )}
          {evaluationResults.length > 0 && (
            <EvaluationResultsTable
              ref={tabelRef}
              evaluation={evaluation}
              evaluationResults={evaluationResults}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
            />
          )}
        </div>
        {selectedResult ? (
          <div ref={sidebarWrapperRef} className='lg:w-1/2 2xl:w-1/3'>
            <EvaluationResultInfo
              key={selectedResult.id}
              evaluation={evaluation}
              evaluationResult={selectedResult}
              providerLog={providerLog}
              sidebarWrapperRef={sidebarWrapperRef}
              tableRef={tabelRef}
            />
          </div>
        ) : null}
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
