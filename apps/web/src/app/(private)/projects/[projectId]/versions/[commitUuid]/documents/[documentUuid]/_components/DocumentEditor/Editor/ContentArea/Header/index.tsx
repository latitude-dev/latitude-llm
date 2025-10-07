import { useMemo } from 'react'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { TitleRow } from '../../EditorHeader/TitleRow'

// TODO: Remove when new editor with sidebar is ready
export function DocumentEditorHeader({
  isMerged,
}: {
  isPlaygroundOpen: boolean
  isMerged: boolean
  togglePlaygroundOpen: () => void
}) {
  const { metadata } = useMetadata()
  const { document } = useCurrentDocument()
  const { updateDocumentContent } = useDocumentValue()
  const name = useMemo(
    () => document.path.split('/').pop() ?? document.path,
    [document.path],
  )
  return (
    <div className='w-full flex flex-col justify-center items-start gap-4 px-4 pb-4'>
      <TitleRow
        title={name}
        isAgent={metadata?.config?.type === 'agent'}
        isMerged={isMerged}
        metadataConfig={metadata?.config}
        prompt={document.content}
        onChangePrompt={updateDocumentContent}
      />
    </div>
  )
}
