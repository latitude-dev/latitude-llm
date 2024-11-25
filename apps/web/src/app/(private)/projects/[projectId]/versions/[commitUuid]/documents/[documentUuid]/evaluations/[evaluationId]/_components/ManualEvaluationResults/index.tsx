'use client'

import { useMemo, useRef, useState } from 'react'

import {
  EvaluationDto,
  EvaluationResultDto,
  ProviderLogDto,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { fetchDocumentLogsWithEvaluationResults } from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
import {
  Button,
  cn,
  FloatingPanel,
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useRefineAction } from '$/hooks/useRefineAction'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useDocumentLogsWithEvaluationResults } from '$/stores/documentLogsWithEvaluationResults'
import { useSearchParams } from 'next/navigation'

import { SubmitEvaluationDocumentation } from '../EvaluationResults/EvaluationBlankSlate'
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
}: {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithEvaluationResults[]
  selectedLog?: DocumentLogWithEvaluationResults
}) {
  const stickyRef = useRef<HTMLTableElement | null>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement | null>(null)
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined
  >(serverSelectedLog)
  const searchParams = useSearchParams()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const document = useCurrentDocument()

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

  const selectableState = useSelectableRows({
    rowIds: evaluatedResultIds,
  })
  const onClickRefine = useRefineAction({
    project,
    commit,
    document,
    getSelectedRowIds: selectableState.getSelectedRowIds,
  })

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
          />
          <div className='flex justify-center sticky bottom-4 pointer-events-none'>
            <FloatingPanel visible={selectableState.selectedCount > 0}>
              <div className='flex flex-row justify-between gap-x-4'>
                <Button
                  disabled={selectableState.selectedCount === 0}
                  fancy
                  onClick={onClickRefine}
                >
                  Refine prompt
                </Button>
                <Button
                  fancy
                  variant='outline'
                  onClick={selectableState.clearSelections}
                >
                  Clear selection
                </Button>
              </div>
            </FloatingPanel>
          </div>
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
