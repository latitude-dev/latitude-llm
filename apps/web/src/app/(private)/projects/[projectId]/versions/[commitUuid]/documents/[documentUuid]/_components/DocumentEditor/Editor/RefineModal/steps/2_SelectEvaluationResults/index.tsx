import { useCallback, useState } from 'react'

import {
  DocumentVersion,
  EvaluationDto,
  EvaluationResult,
} from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  Button,
  TableBlankSlate,
  TableSkeleton,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import useEvaluationResultsByDocumentContent from '$/stores/evaluationResultsByDocumentContent'
import Link from 'next/link'

import { SelectableEvaluationResultsTable } from './SelectableEvaluationResultsTable'

export function SelectEvaluationResults({
  documentVersion,
  evaluation,
  setEvaluationResults,
  navigateBack,
}: {
  documentVersion: DocumentVersion
  evaluation: EvaluationDto
  setEvaluationResults: (evaluationResults: EvaluationResult[]) => void
  navigateBack: () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [selectedEvaluationResults, setSelectedEvaluationResults] = useState<
    EvaluationResultWithMetadata[]
  >([])

  const { data: evaluationResults, isLoading } =
    useEvaluationResultsByDocumentContent({
      documentUuid: documentVersion.documentUuid,
      evaluationId: evaluation.id,
      commitUuid: commit.uuid,
      projectId: project.id,
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
        disabled={
          !evaluationResults?.length || !selectedEvaluationResults.length
        }
        onClick={confirmSelection}
      >
        Select results
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <>
        <TableSkeleton rows={7} cols={5} />
        <ActionButtons />
      </>
    )
  }

  if (!evaluationResults?.length) {
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
          evaluationResults={evaluationResults}
          selectedResults={selectedEvaluationResults}
          setSelectedResults={setSelectedEvaluationResults}
        />
      </div>
      <ActionButtons />
    </>
  )
}
