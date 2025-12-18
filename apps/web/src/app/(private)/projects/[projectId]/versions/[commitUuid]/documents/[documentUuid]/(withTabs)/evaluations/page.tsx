import { Metadata } from 'next'
import { listEvaluationsV2AtCommitByDocumentCached } from '$/app/(private)/_data-access'
import { env } from '@latitude-data/env'
import { EvaluationsPage as ClientEvaluationsPage } from './_components/EvaluationsPage'
import buildMetatags from '$/app/_lib/buildMetatags'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetatags({
    locationDescription: 'Prompt Evaluations List',
  })
}

export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params

  const evaluations = await listEvaluationsV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
  })

  return (
    <ClientEvaluationsPage
      evaluations={evaluations}
      generatorEnabled={env.LATITUDE_CLOUD}
    />
  )
}
