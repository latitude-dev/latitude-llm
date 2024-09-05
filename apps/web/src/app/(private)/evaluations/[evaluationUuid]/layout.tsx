import { ReactNode } from 'react'

import { Text } from '@latitude-data/web-ui'

import { EvaluationTabSelector } from './_components/EvaluationTabs'
import { EvaluationTitle } from './_components/EvaluationTitle'

export default async function EvaluationLayout({
  params,
  children,
}: {
  params: { evaluationUuid: string }
  children: ReactNode
}) {
  return (
    <div className='flex flex-col h-full'>
      <EvaluationTitle evaluationUuid={params.evaluationUuid} />
      <EvaluationTabSelector evaluationUuid={params.evaluationUuid} />
      <div className='flex-grow flex flex-col w-full overflow-hidden'>
        {children}
        <div className='w-full h-[600px] flex flex-col items-center justify-center'>
          <Text.H4>(Really cool dashboard)</Text.H4>
        </div>
      </div>
    </div>
  )
}
