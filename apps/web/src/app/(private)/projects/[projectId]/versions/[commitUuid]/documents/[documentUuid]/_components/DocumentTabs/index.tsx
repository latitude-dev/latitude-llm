'use client'

import { ReactNode, useContext } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'

import { DocumentVersion } from '@latitude-data/core/browser'
import { DocumentationContext } from '../DocumentationModal'
import { DocumentTriggersButton } from './DocumentTriggers'
import { PublishDocumentButton } from './PublishDocument'
import { DocumentTabSelector } from './tabs'

export default function DocumentTabs({
  params,
  children,
  document,
}: {
  params: { documentUuid: string; projectId: string; commitUuid: string }
  document: DocumentVersion
  children: ReactNode
}) {
  const { toggleDocumentation } = useContext(DocumentationContext)

  return (
    <>
      <div className='flex flex-row items-center justify-between pt-6 px-6'>
        <DocumentTabSelector
          projectId={params.projectId}
          commitUuid={params.commitUuid}
          documentUuid={params.documentUuid}
        />
        <div className='flex flex-row items-center gap-x-4'>
          <Button
            variant='ghost'
            onClick={toggleDocumentation}
            iconProps={{ name: 'code2', placement: 'right' }}
          >
            Deploy this prompt
          </Button>
          <PublishDocumentButton
            document={document}
            projectId={Number(params.projectId)}
          />
          <DocumentTriggersButton
            document={document}
            projectId={Number(params.projectId)}
          />
        </div>
      </div>
      <div className='flex-grow min-h-0 flex flex-col w-full relative'>
        {children}
      </div>
    </>
  )
}
