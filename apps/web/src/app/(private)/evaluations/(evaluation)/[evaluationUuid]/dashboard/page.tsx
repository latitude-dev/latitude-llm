import { Button, Container, TableBlankSlate } from '@latitude-data/web-ui'
import {
  getConnectedDocumentsWithMetadataCached,
  getEvaluationByUuidCached,
} from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { EvaluationTabSelector } from '../_components/EvaluationTabs'
import ConnectedDocumentsTable from './_components/ConnectedDocumentsTable'
import EvaluationStats from './_components/EvaluationStats'

export default async function DashboardPage({
  params,
}: {
  params: { evaluationUuid: string }
}) {
  const evaluation = await getEvaluationByUuidCached(params.evaluationUuid)
  const connectedDocumentsWithMetadata =
    await getConnectedDocumentsWithMetadataCached(evaluation.id)

  return (
    <Container>
      <EvaluationTabSelector evaluation={evaluation} />
      {connectedDocumentsWithMetadata.length === 0 && (
        <TableBlankSlate
          description='There are no evaluation results yet. Connect your evaluation with a document and run it to start generating them.'
          link={
            <Link
              href={
                ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor.root
              }
            >
              <Button>Edit the evaluation prompt</Button>
            </Link>
          }
        />
      )}
      {connectedDocumentsWithMetadata.length > 0 && (
        <>
          <EvaluationStats
            evaluation={evaluation}
            connectedDocumentsWithMetadata={connectedDocumentsWithMetadata}
          />
          <ConnectedDocumentsTable
            connectedDocumentsWithMetadata={connectedDocumentsWithMetadata}
          />
        </>
      )}
    </Container>
  )
}
