import { useCallback, useState } from 'react'

import { DocumentVersion, EvaluationDto } from '@latitude-data/core/browser'
import {
  Button,
  TableBlankSlate,
  TableSkeleton,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import Link from 'next/link'

import EvaluationsTable from './EvaluationsTable'

export function SelectEvaluation({
  documentVersion,
  setEvaluation,
}: {
  documentVersion: DocumentVersion
  setEvaluation: (evaluation?: EvaluationDto) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationDto>()

  const { data: evaluations, isLoading } = useEvaluations({
    params: {
      documentUuid: documentVersion.documentUuid,
    },
  })

  const confirmSelection = useCallback(() => {
    setEvaluation(selectedEvaluation)
  }, [selectedEvaluation, setEvaluation])

  const ActionButtons = () => (
    <div className='w-full flex justify-end'>
      <Button
        disabled={!evaluations?.length || !selectedEvaluation}
        onClick={confirmSelection}
      >
        Select evaluation
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <>
        <TableSkeleton rows={7} cols={3} />
        <ActionButtons />
      </>
    )
  }

  if (!evaluations?.length) {
    return (
      <>
        <TableBlankSlate
          description='There are no evaluations connected to this document. To make suggestions our system needs evaluations. Create and run an evaluation and come back.'
          link={
            <Link
              href={
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: documentVersion.documentUuid })
                  .evaluations.root
              }
            >
              <Button>Go to evaluations</Button>
            </Link>
          }
        />
        <ActionButtons />
      </>
    )
  }

  return (
    <>
      <EvaluationsTable
        documentUuid={documentVersion.documentUuid}
        evaluations={evaluations}
        onSelect={setSelectedEvaluation}
      />
      <ActionButtons />
    </>
  )
}
