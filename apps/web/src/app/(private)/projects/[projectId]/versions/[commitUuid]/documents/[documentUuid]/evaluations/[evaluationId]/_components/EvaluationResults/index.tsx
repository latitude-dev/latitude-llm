'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useRefineAction } from '$/hooks/useRefineAction'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useToggleModal } from '$/hooks/useToogleModal'
import useEvaluationResultsWithMetadata from '$/stores/evaluationResultsWithMetadata'
import { useProviderLog } from '$/stores/providerLogs'
import { EvaluationDto } from '@latitude-data/core/browser'
import { type EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import {
  cn,
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useSearchParams } from 'next/navigation'

import { useMetadata } from '$/hooks/useMetadata'
import CreateBatchEvaluationModal from '../Actions/CreateBatchEvaluationModal'
import { RefineEvaluationResults } from '../RefineEvaluationResults'
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
      if (!args.row) return

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
  selectedResult: serverSelectedResult,
  refinementEnabled,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultWithMetadataAndErrors[]
  refinementEnabled: boolean
  selectedResult?: EvaluationResultWithMetadataAndErrors
}) {
  const tabelRef = useRef<HTMLTableElement | null>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const [selectedResult, setSelectedResult] = useState<
    EvaluationResultWithMetadataAndErrors | undefined
  >(serverSelectedResult)
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
  const evaluatedResultIds = useMemo(
    () => evaluationResults.filter((r) => !r.error.message).map((r) => r.id),
    [evaluationResults],
  )

  const selectableState = useSelectableRows({
    rowIds: evaluatedResultIds,
  })
  const onClickRefine = useRefineAction({
    project,
    commit,
    document,
    getSelectedRowIds: selectableState.getSelectedRowIds,
  })
  useEvaluationResultsSocket(evaluation, document, mutate)
  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      prompt: document.content ?? '',
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
    })
  }, [])

  return (
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
      <Text.H4>Evaluation Results</Text.H4>
      <EvaluationStatusBanner
        documentUuid={document.documentUuid}
        evaluation={evaluation}
      />
      <div
        className={cn('gap-x-4 grid pb-6', {
          'grid-cols-1': !selectedResult,
          'grid-cols-2 xl:grid-cols-[2fr_1fr]': selectedResult,
        })}
      >
        {evaluationResults.length > 0 ? (
          <div className='flex flex-col gap-4'>
            <EvaluationResultsTable
              ref={tabelRef}
              evaluation={evaluation}
              evaluationResults={evaluationResults}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              selectableState={selectableState}
              selectionEnabled={refinementEnabled}
            />
            <RefineEvaluationResults
              selectedCount={selectableState.selectedCount}
              onClickRefine={onClickRefine}
              clearSelections={selectableState.clearSelections}
              refinementEnabled={refinementEnabled}
            />
          </div>
        ) : (
          <TableBlankSlate
            description='There are no evaluation results yet. Run the evaluation or, if you already have, wait a few seconds for the first results to stream in.'
            link={
              <TableBlankSlate.Button onClick={onOpen}>
                Run the evaluation
              </TableBlankSlate.Button>
            }
          />
        )}
        {selectedResult ? (
          <div ref={sidebarWrapperRef}>
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
        documentMetadata={metadata}
        evaluation={{ ...evaluation, version: 'v1' }}
        projectId={project.id.toString()}
        commitUuid={commit.uuid}
      />
    </div>
  )
}
