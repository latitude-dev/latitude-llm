'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import {
  TableBlankSlate,
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import Link from 'next/link'

import BatchEvaluationsTable from './BatchEvaluationsTable'

export default function EvaluationsLayoutClient({
  evaluations: fallbackData,
}: {
  evaluations: EvaluationDto[]
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const { data: evaluations } = useEvaluations({
    fallbackData,
    params: { documentUuid: document.documentUuid },
  })

  const href = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).evaluations.dashboard
    .connect.root

  return (
    <>
      {evaluations.length > 0 && (
        <BatchEvaluationsTable evaluations={evaluations} />
      )}
      {evaluations.length === 0 && (
        <TableBlankSlate
          description='There are no evaluations connected to this prompt yet. Connect one to start evaluating the prompt.'
          link={
            <Link href={href}>
              <TableBlankSlate.Button>
                Connect your first evaluation
              </TableBlankSlate.Button>
            </Link>
          }
        />
      )}
    </>
  )
}
