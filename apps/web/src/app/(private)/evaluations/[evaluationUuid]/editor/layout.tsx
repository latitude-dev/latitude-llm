import { ReactNode } from 'react'

import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'

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
    <>
      {children}
      <EvaluationEditor
        evaluationUuid={evaluationUuid}
        defaultPrompt={evaluation.metadata.prompt}
      />
    </>
  )
}
