import { ReactNode } from 'react'

import {
  getEvaluationsByDocumentUuidCached,
  getEvaluationTemplatesCached,
} from '$/app/(private)/_data-access'
import env from '$/env'

import EvaluationsLayoutClient from './_components/Layout'

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
  const { documentUuid } = await params
  const evaluations = await getEvaluationsByDocumentUuidCached(documentUuid)
  const evaluationTemplates = await getEvaluationTemplatesCached()
  return (
    <div className='w-full p-6'>
      {children}
      <EvaluationsLayoutClient
        evaluations={evaluations}
        templates={evaluationTemplates}
        isGeneratorEnabled={!!env.LATITUDE_CLOUD}
      />
    </div>
  )
}
