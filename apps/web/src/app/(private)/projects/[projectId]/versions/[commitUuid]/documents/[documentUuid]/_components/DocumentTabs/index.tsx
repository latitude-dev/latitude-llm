'use client'

import { ReactNode, useContext } from 'react'

import { Button, Icon } from '@latitude-data/web-ui'

import { DocumentationContext } from '../DocumentationModal'
import { DocumentTabSelector } from './tabs'

export default function DocumentTabs({
  params,
  children,
}: {
  params: { documentUuid: string; projectId: string; commitUuid: string }
  children: ReactNode
}) {
  const { toggleDocumentation } = useContext(DocumentationContext)
  return (
    <div className='flex flex-col h-full'>
      <div className='flex flex-row items-center justify-between pt-6 px-4'>
        <DocumentTabSelector
          projectId={params.projectId}
          commitUuid={params.commitUuid}
          documentUuid={params.documentUuid}
        />
        <Button variant='ghost' onClick={toggleDocumentation}>
          Deploy this prompt <Icon name='code2' />
        </Button>
      </div>
      <div className='flex-grow flex flex-col w-full'>{children}</div>
    </div>
  )
}
