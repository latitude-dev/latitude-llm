import { ReactNode } from 'react'

import {
  getEvaluationsByDocumentUuidCached,
  getEvaluationTemplatesCached,
  listEvaluationsV2AtCommitByDocumentCached,
} from '$/app/(private)/_data-access'

import EvaluationsLayoutClient from './_components/Layout'
import { env } from '@latitude-data/env'

export default async function EvaluationsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params
  const evaluations = await getEvaluationsByDocumentUuidCached(documentUuid)
  const evaluationsV2 = await listEvaluationsV2AtCommitByDocumentCached({
    projectId: Number(projectId),
    commitUuid: commitUuid,
    documentUuid: documentUuid,
  })
  const evaluationTemplates = await getEvaluationTemplatesCached()
  return (
    <div className='w-full p-6'>
      {children}
      <EvaluationsLayoutClient
        evaluations={evaluations}
        evaluationsV2={evaluationsV2}
        templates={evaluationTemplates}
        isGeneratorEnabled={!!env.LATITUDE_CLOUD}
      />
    </div>
  )
}
