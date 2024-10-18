import { ReactNode } from 'react'

import { getEvaluationTemplatesCached } from '$/app/(private)/_data-access'
import Evaluations from '$/app/(private)/evaluations/_components/Evaluations'

export default async function EvaluationsLayout({
  children,
}: {
  children: ReactNode
}) {
  const evaluationTemplates = await getEvaluationTemplatesCached()

  return (
    <>
      <Evaluations evaluationTemplates={evaluationTemplates} />
      {children}
    </>
  )
}
