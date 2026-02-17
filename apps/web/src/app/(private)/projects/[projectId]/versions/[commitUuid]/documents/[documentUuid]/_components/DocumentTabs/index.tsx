'use client'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { ReactNode } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useDeployPrompt } from '../DocumentationModal'
import { DocumentTabSelector } from './tabs'
import { useProductAccess } from '$/components/Providers/SessionProvider'

export default function DocumentTabs({
  params,
  children,
}: {
  params: { documentUuid: string; projectId: string; commitUuid: string }
  document: DocumentVersion
  children: ReactNode
}) {
  const { promptManagement } = useProductAccess()
  const { toggleDocumentation } = useDeployPrompt()

  return (
    <>
      <div className='flex flex-row items-center justify-between pt-6 px-6'>
        <DocumentTabSelector
          projectId={params.projectId}
          commitUuid={params.commitUuid}
          documentUuid={params.documentUuid}
        />
        {promptManagement && (
          <div className='flex flex-row items-center gap-x-4'>
            <Button
              variant='ghost'
              onClick={toggleDocumentation}
              iconProps={{ name: 'code2', placement: 'right' }}
            >
              Deploy this prompt
            </Button>
          </div>
        )}
      </div>
      <div className='flex-grow min-h-0 flex flex-col w-full relative'>
        {children}
      </div>
    </>
  )
}
