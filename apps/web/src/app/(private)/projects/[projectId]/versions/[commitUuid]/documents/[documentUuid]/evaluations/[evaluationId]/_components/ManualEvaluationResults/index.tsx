'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  PlaygroundAction,
  usePlaygroundAction,
} from '$/hooks/usePlaygroundAction'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useDocumentLogsWithEvaluationResults } from '$/stores/documentLogsWithEvaluationResults'
import {
  EvaluationDto,
  EvaluationResultDto,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { fetchDocumentLogsWithEvaluationResults } from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { SubmitEvaluationDocumentation } from '../EvaluationResults/EvaluationBlankSlate'
import { RefineEvaluationResults } from '../RefineEvaluationResults'
import { DocumentLogInfoForManualEvaluation } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

type DocumentLogWithEvaluationResults = Awaited<
  ReturnType<typeof fetchDocumentLogsWithEvaluationResults>
>[number]

export type DocumentLogWithMetadataAndErrorAndEvaluationResult =
  DocumentLogWithMetadataAndError & {
    result?: EvaluationResultDto
    providerLogs?: ProviderLogDto[]
  }

export function ManualEvaluationResultsClient({
  evaluation,
  documentLogs: fallbackData,
  selectedLog: serverSelectedLog,
  refinementEnabled,
}: {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithEvaluationResults[]
  selectedLog?: DocumentLogWithEvaluationResults
  refinementEnabled: boolean
}) {
  const stickyRef = useRef<HTMLTableElement | null>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null)
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined
  >(serverSelectedLog)
  const searchParams = useSearchParams()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const { data: documentLogs } = useDocumentLogsWithEvaluationResults(
    {
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page,
      pageSize,
    },
    { fallbackData },
  )
  const evaluatedResultIds = useMemo(
    () => documentLogs.map((log) => log.result?.id).filter(Boolean) as number[],
    [documentLogs],
  )

  const { setPlaygroundAction } = usePlaygroundAction({
    action: PlaygroundAction.RefinePrompt,
    project: project,
    commit: commit,
    document: document,
  })

  const selectableState = useSelectableRows({
    rowIds: evaluatedResultIds,
  })
  const onClickRefine = useCallback(async () => {
    setPlaygroundAction({
      evaluationId: evaluation.id,
      resultIds: selectableState.getSelectedRowIds(),
      version: 'v1',
    })
  }, [setPlaygroundAction, evaluation, selectableState])

  if (documentLogs.length === 0) {
    return (
      <TableBlankSlate
        description="There are no evaluation results yet. Submit the first evaluation result using Latitude's SDK or HTTP API."
        link={<SubmitEvaluationDocumentation evaluation={evaluation} />}
      />
    )
  }

  return (
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
      <Text.H4>Prompt logs</Text.H4>
      <div
        className={cn('gap-x-4 grid pb-6', {
          'grid-cols-1': !selectedLog,
          'grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]': selectedLog,
        })}
      >
        <div className='flex flex-col gap-4'>
          <DocumentLogsTable
            ref={stickyRef}
            evaluation={evaluation}
            documentLogs={
              documentLogs as DocumentLogWithMetadataAndErrorAndEvaluationResult[]
            }
            selectedLog={selectedLog}
            setSelectedLog={setSelectedLog}
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
        {selectedLog ? (
          <div ref={sidebarWrapperRef}>
            <DocumentLogInfoForManualEvaluation
              key={selectedLog.id}
              documentLog={selectedLog}
              providerLogs={selectedLog.providerLogs}
              evaluation={evaluation}
              stickyRef={stickyRef}
              sidebarWrapperRef={sidebarWrapperRef}
              offset={{ top: 20, bottom: 12 }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
