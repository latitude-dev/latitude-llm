'use client'

import { useState } from 'react'

import { EvaluationDto, ProviderLogDto } from '@latitude-data/core/browser'
import {
  DocumentLogWithMetadataAndError,
  EvaluationResultDto,
} from '@latitude-data/core/repositories'
import { fetchDocumentLogsWithEvaluationResults } from '@latitude-data/core/services/documentLogs/fetchDocumentLogsWithEvaluationResults'
import {
  TableBlankSlate,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useDocumentLogsWithEvaluationResults } from '$/stores/documentLogsWithEvaluationResults'
import { useSearchParams } from 'next/navigation'

import { SubmitEvaluationDocumentation } from '../EvaluationResults/EvaluationBlankSlate'
import { DocumentLogInfoForManualEvaluation } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

type DocumentLogWithEvaluationResults = Awaited<
  ReturnType<typeof fetchDocumentLogsWithEvaluationResults>
>

export type DocumentLogWithMetadataAndErrorAndEvaluationResult =
  DocumentLogWithMetadataAndError & {
    result?: EvaluationResultDto
    providerLogs?: ProviderLogDto[]
  }

export function ManualEvaluationResultsClient({
  evaluation,
  documentLogs: serverDocumentLogs,
}: {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithEvaluationResults
}) {
  const [selectedLog, setSelectedLog] =
    useState<DocumentLogWithMetadataAndErrorAndEvaluationResult>()
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const document = useCurrentDocument()
  const { data: documentLogs = [] } = useDocumentLogsWithEvaluationResults(
    {
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page,
      pageSize,
    },
    {
      fallbackData: serverDocumentLogs,
    },
  )

  return (
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
      <Text.H4>Prompt logs</Text.H4>
      <div className='flex flex-row flex-grow gap-4 min-w-[1024px]'>
        <div className='flex-1 mb-6'>
          {documentLogs.length === 0 && (
            <TableBlankSlate
              description="There are no evaluation results yet. Submit the first evaluation result using Latitude's SDK or HTTP API."
              link={<SubmitEvaluationDocumentation evaluation={evaluation} />}
            />
          )}
          {documentLogs.length > 0 && (
            <DocumentLogsWithEvaluationResultsTable
              evaluation={evaluation}
              documentLogs={
                documentLogs as DocumentLogWithMetadataAndErrorAndEvaluationResult[]
              }
              selectedLog={selectedLog}
              setSelectedLog={setSelectedLog}
            />
          )}
        </div>
        {selectedLog ? (
          <div className='lg:w-1/2 2xl:w-1/3'>
            <DocumentLogInfoForManualEvaluation
              key={selectedLog.id}
              documentLog={selectedLog}
              providerLogs={selectedLog.providerLogs}
              evaluation={evaluation}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DocumentLogsWithEvaluationResultsTable({
  evaluation,
  documentLogs,
  selectedLog,
  setSelectedLog,
}: {
  evaluation: EvaluationDto
  documentLogs: DocumentLogWithMetadataAndErrorAndEvaluationResult[]
  selectedLog: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined
  setSelectedLog: (
    log: DocumentLogWithMetadataAndErrorAndEvaluationResult | undefined,
  ) => void
}) {
  return (
    <DocumentLogsTable
      evaluation={evaluation}
      documentLogs={documentLogs}
      selectedLog={selectedLog}
      setSelectedLog={setSelectedLog}
    />
  )
}
