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
import { findOrCreateMainDocumentCached } from '$/lib/dualScope/findOrCreateMainDocumentCached'
import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
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

  const { commit, document } = await findOrCreateMainDocumentCached({ project })
  if (!document) return notFound()

  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    evaluationUuid,
  })

  return (
    <EvaluationV2Provider evaluation={evaluation}>
      {children}
    </EvaluationV2Provider>
  )
}
