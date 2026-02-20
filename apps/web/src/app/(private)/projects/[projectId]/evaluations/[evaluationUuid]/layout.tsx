'use server'

import { ReactNode } from 'react'
import {
  findProjectCached,
  getEvaluationV2AtCommitByDocumentCached,
} from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { EvaluationV2Provider } from '$/app/providers/EvaluationV2Provider'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { getProjectMainDocumentCached } from '$/lib/dualScope/getProjectMainDocumentCached'
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

  const result = await getProjectMainDocumentCached({ project })
  if (!result) return notFound()
  const { commit, document: mainDoc } = result

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
