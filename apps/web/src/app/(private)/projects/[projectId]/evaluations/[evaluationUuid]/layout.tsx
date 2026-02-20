'use server'

import { ReactNode } from 'react'
import {
  findCommitsByProjectCached,
  findProjectCached,
  getEvaluationV2AtCommitByDocumentCached,
} from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { EvaluationV2Provider } from '$/app/providers/EvaluationV2Provider'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { getOrCreateProjectMainDocument } from '@latitude-data/core/services/documents/getOrCreateProjectMainDocument'
import { notFound, redirect } from 'next/navigation'

export async function generateMetadata() {
  return buildMetatags({
    locationDescription: 'Project Evaluation Dashboard',
  })
}

export default async function ProjectEvaluationLayout({
  params,
  children,
}: {
  params: Promise<{
    projectId: string
    evaluationUuid: string
  }>
  children: ReactNode
}) {
  const { projectId: pjid, evaluationUuid } = await params
  const projectId = Number(pjid)

  const session = await getCurrentUserOrRedirect()
  if (!session.workspace || !session.user) return redirect(ROUTES.root)

  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })

  const commits = await findCommitsByProjectCached({ projectId: project.id })
  const commit = commits[0]
  if (!commit) return notFound()

  const mainDocResult = await getOrCreateProjectMainDocument({
    workspace: session.workspace,
    user: session.user,
    commit,
  })
  if (mainDocResult.error) {
    throw mainDocResult.error
  }
  const mainDoc = mainDocResult.value

  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: mainDoc.documentUuid,
    evaluationUuid,
  })

  return (
    <EvaluationV2Provider evaluation={evaluation}>
      {children}
    </EvaluationV2Provider>
  )
}
