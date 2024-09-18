import { ReactNode } from 'react'

import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'

import { EvaluationTabSelector } from '../_components/EvaluationTabs'
import EvaluationEditor from './_components/EvaluationEditor/Editor'

export default async function DocumentPage({
  children,
  params,
}: {
  children: ReactNode
  params: { evaluationUuid: string }
}) {
  const evaluationUuid = params.evaluationUuid
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)

  return (
    <div className='h-full flex flex-col gap-y-4 p-6'>
      <EvaluationTabSelector evaluation={evaluation} />
      <div className='flex-grow'>
        <EvaluationEditor
          evaluationUuid={evaluationUuid}
          defaultPrompt={evaluation.metadata.prompt}
        />
      </div>
      {children}
    </div>
  )
}
