import { ReactNode } from 'react'

import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'

import { EvaluationTabSelector } from './_components/EvaluationTabs'
import { EvaluationTitle } from './_components/EvaluationTitle'

export default async function EvaluationLayout({
  params,
  children,
}: {
  params: { evaluationUuid: string }
  children: ReactNode
}) {
  const evaluation = await getEvaluationByUuidCached(params.evaluationUuid)

  return (
    <div className='flex flex-col h-full'>
      <EvaluationTabSelector evaluation={evaluation} />
      <EvaluationTitle evaluation={evaluation} />
      <div className='flex-grow flex flex-col w-full overflow-hidden'>
        {children}
      </div>
    </div>
  )
}
