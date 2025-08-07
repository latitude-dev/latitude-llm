'use client'

import { PublishedDocument } from '@latitude-data/core/browser'

import { ServerClientMetadata } from '$/app/(public)/share/d/[publishedDocumentUuid]/_components/SharedDocument/types'
import { PromptHeader } from '../Header'
import { DisplayPrompt } from './DisplayPrompt'
import { RunPrompt } from './RunPrompt'

export function SharedDocument({
  metadata,
  shared,
  queryParams,
}: {
  metadata: ServerClientMetadata
  shared: PublishedDocument
  queryParams: Record<string, string>
}) {
  return (
    <div className='h-screen bg-background-gray flex flex-col pb-4 sm:pb-8 gap-y-4 sm:gap-y-8 custom-scrollbar'>
      <PromptHeader shared={shared} />
      {shared.displayPromptOnly ? (
        <DisplayPrompt prompt={metadata.resolvedPrompt} />
      ) : (
        <RunPrompt
          metadata={metadata}
          shared={shared}
          queryParams={queryParams}
        />
      )}
    </div>
  )
}
