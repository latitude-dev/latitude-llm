'use server'

import { getEvaluationV2AtCommitByDocumentCached } from '$/app/(private)/_data-access'
import { EvaluationV2Provider } from '$/app/providers/EvaluationV2Provider'
import { ReactNode } from 'react'

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

  return (
    <EvaluationV2Provider evaluation={evaluation}>
      {children}
    </EvaluationV2Provider>
  )
}
