'use client'

import { ReactNode, useContext } from 'react'

import { Button, Icon, useCurrentCommit } from '@latitude-data/web-ui'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

import { DocumentationContext } from '../DocumentationModal'
import { ShareDocument } from './ShareDocument'
import { DocumentTabSelector } from './tabs'
import { DocumentVersion } from '@latitude-data/core/browser'

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
  const hasFeature = useFeatureFlag()
  const { isHead } = useCurrentCommit()
  return (
    <>
      <div className='flex flex-row items-center justify-between pt-6 px-6'>
        <DocumentTabSelector
          projectId={params.projectId}
          commitUuid={params.commitUuid}
          documentUuid={params.documentUuid}
        />
        <div className='flex flex-row items-center gap-x-4'>
          <Button variant='ghost' onClick={toggleDocumentation}>
            Deploy this prompt <Icon name='code2' />
          </Button>
          {hasFeature && (
            <ShareDocument
              document={document}
              projectId={Number(params.projectId)}
              commitUuid={params.commitUuid}
              documentUuid={params.documentUuid}
              canShare={isHead}
            />
          )}
        </div>
      </div>
      <div className='flex-grow min-h-0 flex flex-col w-full relative'>
        {children}
      </div>
    </>
  )
}
