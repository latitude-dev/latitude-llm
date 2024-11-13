import {
  EvaluationDto,
  EvaluationMetadataType,
  LATITUDE_DOCS_URL,
} from '@latitude-data/core/browser'
import { Button, Container, Icon, TableBlankSlate } from '@latitude-data/web-ui'
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

  // TODO: Use regular connectedDocuments. Metadata aggregations will be calculated automatically when using <EvaluationAggregatedResult /> component.
  const connectedDocumentsWithMetadata =
    await getConnectedDocumentsWithMetadataCached(evaluation.id)

  return (
    <Container>
      {evaluation.metadataType !== EvaluationMetadataType.Manual && (
        <EvaluationTabSelector evaluation={evaluation} />
      )}
      {connectedDocumentsWithMetadata.length === 0 && (
        <EvaluationBlankslate evaluation={evaluation} />
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

function EvaluationBlankslate({ evaluation }: { evaluation: EvaluationDto }) {
  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return (
      <TableBlankSlate
        description='There are no evaluation results yet. Learn how to submit evaluation results with our SDK or HTTP API.'
        link={
          <Link href={LATITUDE_DOCS_URL}>
            <Button variant='link'>
              Check out the docs <Icon name='externalLink' />
            </Button>
          </Link>
        }
      />
    )
  }

  return (
    <TableBlankSlate
      description='There are no evaluation results yet. Connect your evaluation with a document and run it to start generating them.'
      link={
        <Link
          href={
            ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor.root
          }
        >
          <Button fancy>Edit the evaluation prompt</Button>
        </Link>
      }
    />
  )
}
