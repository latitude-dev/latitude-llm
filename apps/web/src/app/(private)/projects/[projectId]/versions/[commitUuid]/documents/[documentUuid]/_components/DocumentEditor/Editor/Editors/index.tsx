import { useDevMode } from '$/hooks/useDevMode'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useMetadata } from '$/hooks/useMetadata'
import type { DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { PlaygroundBlocksEditor } from '../BlocksEditor'
import { useDiffState } from '../hooks/useDiffState'
import { useLatteStreaming } from '../hooks/useLatteStreaming'
import { PlaygroundTextEditor } from '../TextEditor'

export function Editors({
  document,
  initialDiff,
  refinementEnabled,
}: {
  document: DocumentVersion
  initialDiff: string | undefined
  refinementEnabled: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { devMode } = useDevMode()
  const { metadata } = useMetadata()
  const { value, setValue, updateDocumentContent, isSaved } = useDocumentValue()
  const { customReadOnlyMessage, highlightedCursorIndex } = useLatteStreaming({
    value,
    setValue,
  })
  const { diff, setDiff } = useDiffState(initialDiff, updateDocumentContent)
  const readOnlyMessage =
    commit.mergedAt !== null ? 'Create a draft to edit documents.' : customReadOnlyMessage

  return devMode ? (
    <PlaygroundTextEditor
      copilotEnabled={false}
      refinementEnabled={refinementEnabled}
      compileErrors={metadata?.errors}
      project={project}
      document={document}
      commit={commit}
      setDiff={setDiff}
      diff={diff}
      value={value}
      defaultValue={document.content}
      readOnlyMessage={readOnlyMessage}
      isSaved={isSaved}
      onChange={updateDocumentContent}
      highlightedCursorIndex={highlightedCursorIndex}
    />
  ) : (
    <PlaygroundBlocksEditor
      commit={commit}
      config={metadata?.config}
      document={document}
      onChange={updateDocumentContent}
      project={project}
      readOnlyMessage={readOnlyMessage}
      defaultValue={metadata?.rootBlock}
    />
  )
}
