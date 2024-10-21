import { useCallback, useState } from 'react'

import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import {
  Button,
  TableBlankSlate,
  TableSkeleton,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import useEvaluationResultsByDocumentContent, {
  EvaluationResultByDocument,
} from '$/stores/evaluationResultsByDocumentContent'
import useEvaluationResultsByDocumentPagination from '$/stores/useEvaluationResultsByDocumentCount'
import Link from 'next/link'

import { SelectableEvaluationResultsTable } from './SelectableEvaluationResultsTable'

const PAGE_SIZE = 10

export function SelectEvaluationResults({
  documentVersion,
  evaluation,
  setEvaluationResults,
  navigateBack,
}: {
  documentVersion: DocumentVersion
  evaluation: EvaluationDto
  setEvaluationResults: (
    evaluationResults: EvaluationResultByDocument[],
  ) => void
  navigateBack: () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [selectedEvaluationResults, setSelectedEvaluationResults] = useState<
    EvaluationResultByDocument[]
  >([])

  const [page, setPage] = useState(1)

  const { data: rows, isLoading } = useEvaluationResultsByDocumentContent({
    documentUuid: documentVersion.documentUuid,
    evaluationId: evaluation.id,
    commitUuid: commit.uuid,
    projectId: project.id,
    page: page,
    pageSize: PAGE_SIZE,
  })
  const { data: pagination, isLoading: isLoadingCount } =
    useEvaluationResultsByDocumentPagination({
      documentUuid: documentVersion.documentUuid,
      evaluationId: evaluation.id,
      commitUuid: commit.uuid,
      projectId: project.id,
      page: page.toString(),
      pageSize: PAGE_SIZE.toString(),
    })

  const confirmSelection = useCallback(() => {
    setEvaluationResults(selectedEvaluationResults)
  }, [setEvaluationResults, selectedEvaluationResults])

  const ActionButtons = () => (
    <div className='w-full flex justify-end gap-4'>
      <Button variant='outline' onClick={navigateBack}>
        Back
      </Button>
      <Button
        disabled={!rows?.length || !selectedEvaluationResults.length}
        onClick={confirmSelection}
      >
        Select results
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <>
        <TableSkeleton rows={PAGE_SIZE} cols={5} />
        <ActionButtons />
      </>
    )
  }

  if (!rows?.length) {
    return (
      <>
        <TableBlankSlate
          description='This evaluation has not evaluated any log from this version of the document. To make suggestions, our system needs logs. Run an evaluation to generate logs and come back.'
          link={
            <Link
              href={
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: documentVersion.documentUuid })
                  [DocumentRoutes.evaluations].detail(evaluation.id).root
              }
            >
              <Button>Run batch evaluations</Button>
            </Link>
          }
        />
        <ActionButtons />
      </>
    )
  }

  return (
    <>
      <div className='flex'>
        <SelectableEvaluationResultsTable
          evaluation={evaluation}
          evaluationResultsRows={rows}
          selectedResults={selectedEvaluationResults}
          setSelectedResults={setSelectedEvaluationResults}
          page={page}
          setPage={setPage}
          pageSize={PAGE_SIZE}
          totalCount={pagination?.count ?? 0}
          isLoadingCount={isLoadingCount}
        />
      </div>
      <ActionButtons />
    </>
  )
}
