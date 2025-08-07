'use server'

import { getEvaluationV2AtCommitByDocumentCached } from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import { EvaluationV2Provider } from '$/app/providers/EvaluationV2Provider'
import type { ReactNode } from 'react'

export async function generateMetadata() {
  return buildMetatags({
    locationDescription: 'Prompt Evaluations Dashboard',
  })
}

export default async function EvaluationLayout({
  params,
  children,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
  }>
  children: ReactNode
}) {
  const { projectId, commitUuid, documentUuid, evaluationUuid } = await params

  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
    evaluationUuid: evaluationUuid,
  })

  return <EvaluationV2Provider evaluation={evaluation}>{children}</EvaluationV2Provider>
}
