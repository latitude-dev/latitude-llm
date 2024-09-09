import { Container } from '@latitude-data/web-ui'
import {
  getConnectedDocumentsWithMetadataCached,
  getEvaluationByUuidCached,
} from '$/app/(private)/_data-access'

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
      <EvaluationStats
        evaluation={evaluation}
        connectedDocumentsWithMetadata={connectedDocumentsWithMetadata}
      />
      <ConnectedDocumentsTable
        connectedDocumentsWithMetadata={connectedDocumentsWithMetadata}
      />
    </Container>
  )
}
