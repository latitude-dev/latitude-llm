'use client'

import { TriggersSection } from './Triggers'
import { MainAgent } from './Agent'
import { RunProps } from '$/components/Agent/types'
import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { EmptyProjectPage } from './EmptyProject'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

function Spring() {
  // Using 'justify-center' does center the content, but fails to overflow correctly.
  // Using 'justify-start' but centering it with springs works.
  return <div className='flex-grow min-h-0' />
}

export function MainAgentSection({
  runPromptFn,
  serverDocuments,
}: {
  runPromptFn: (props: RunProps) => void
  serverDocuments: DocumentVersion[]
}) {
  const { commit } = useCurrentCommit()

  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions(
      {
        commitUuid: commit.uuid,
        projectId: commit.projectId,
      },
      {
        fallbackData: serverDocuments,
      },
    )

  const hasDocuments = isLoadingDocuments
    ? serverDocuments.length > 0
    : documents?.length > 0

  return (
    <div className='relative h-full custom-scrollbar flex flex-col items-center w-full'>
      <div className='flex flex-col items-center py-[72px] px-8 w-full h-full max-w-[500px]'>
        <Spring />

        <div className='flex flex-col items-center gap-20 w-full'>
          {hasDocuments ? (
            <>
              <MainAgent runPromptFn={runPromptFn} />

              <div className='w-px h-16 bg-border flex-shrink-0' />

              <TriggersSection runPromptFn={runPromptFn} />
            </>
          ) : (
            <EmptyProjectPage />
          )}
        </div>

        <Spring />
      </div>
    </div>
  )
}
