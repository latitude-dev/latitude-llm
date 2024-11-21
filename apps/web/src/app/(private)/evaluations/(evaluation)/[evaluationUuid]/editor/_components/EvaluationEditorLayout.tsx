'use client'

import { ReactNode } from 'react'

import { EvaluationDto, ProviderApiKey } from '@latitude-data/core/browser'
import { Button, Icon } from '@latitude-data/web-ui'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { EvaluationTabSelector } from '../../_components/EvaluationTabs'
import EvaluationEditor from './Editor'
import Playground from './Playground'

interface EvaluationEditorLayoutProps {
  children: ReactNode
  evaluation: EvaluationDto
  providerApiKeys: ProviderApiKey[]
  freeRunsCount: number | undefined
}

export default function EvaluationEditorLayout({
  children,
  evaluation,
  providerApiKeys,
  freeRunsCount,
}: EvaluationEditorLayoutProps) {
  const searchParams = useSearchParams()
  const backUrl = searchParams.get('back')

  return (
    <div className='h-full flex flex-col gap-y-4 p-6'>
      {backUrl && (
        <Link href={backUrl}>
          <Button variant='link'>
            <Icon name='arrowLeft' /> Back to the document
          </Button>
        </Link>
      )}
      <EvaluationTabSelector evaluation={evaluation} />
      <div className='flex-grow'>
        <div className='flex flex-row w-full h-full gap-8'>
          <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
            <EvaluationEditor
              evaluation={evaluation}
              providerApiKeys={providerApiKeys}
              freeRunsCount={freeRunsCount}
            />
          </div>
          <div className='flex flex-col flex-1 gap-2 min-w-0 max-w-1/2 overflow-y-auto max-h-[calc(100vh-150px)]'>
            <Playground evaluation={evaluation} />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
