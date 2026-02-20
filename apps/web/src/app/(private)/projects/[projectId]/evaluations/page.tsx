import { Metadata } from 'next'
import {
  findProjectCached,
  listEvaluationsV2AtCommitByDocumentCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { env } from '@latitude-data/env'
import { findOrCreateMainDocumentCached } from '$/lib/dualScope/findOrCreateMainDocumentCached'
import { EvaluationsPage as ClientEvaluationsPage } from '../versions/[commitUuid]/documents/[documentUuid]/(withTabs)/evaluations/_components/EvaluationsPage'
import buildMetatags from '$/app/_lib/buildMetatags'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetatags({
    locationDescription: 'Project Evaluations',
  })
}

export default async function ProjectEvaluationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId: pjid } = await params
  const projectId = Number(pjid)

  const session = await getCurrentUserOrRedirect()
  if (!session.workspace || !session.user) return redirect(ROUTES.root)

  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })

  const { commit, document: mainDoc } = await findOrCreateMainDocumentCached({
    project,
  })
  const evaluations = await listEvaluationsV2AtCommitByDocumentCached({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: mainDoc.documentUuid,
  })

  return (
    <ClientEvaluationsPage
      evaluations={evaluations}
      generatorEnabled={env.LATITUDE_CLOUD}
    />
  )
}
