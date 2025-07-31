import { PlaygroundTextEditor } from '../TextEditor'
import { PlaygroundBlocksEditor } from '../BlocksEditor'
import { useDiffState } from '../hooks/useDiffState'
import { useLatteStreaming } from '../hooks/useLatteStreaming'
import { DocumentVersion } from '@latitude-data/core/browser'
import useDocumentVersions from '$/stores/documentVersions'
import { useMetadata } from '$/hooks/useMetadata'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useDevMode } from '../hooks/useDevMode'
import { useDocumentValue } from '../context/DocumentValueContext'

export function Editors({
  document,
  initialDiff,
}: {
  document: DocumentVersion
  initialDiff: string | undefined
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { devMode } = useDevMode()
  const { metadata } = useMetadata()
  const { isUpdatingContent } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { value, setValue, updateDocumentContent } = useDocumentValue()
  const { customReadOnlyMessage, highlightedCursorIndex } = useLatteStreaming({
    value,
    setValue,
  })
  const { diff, setDiff } = useDiffState(initialDiff, updateDocumentContent)
  const readOnlyMessage =
    commit.mergedAt !== null
      ? 'Create a draft to edit documents.'
      : customReadOnlyMessage

  return devMode ? (
    <PlaygroundTextEditor
      copilotEnabled={false}
      compileErrors={metadata?.errors}
      project={project}
      document={document}
      commit={commit}
      setDiff={setDiff}
      diff={diff}
      value={value}
      defaultValue={document.content}
      readOnlyMessage={readOnlyMessage}
      isSaved={!isUpdatingContent}
      onChange={updateDocumentContent}
      highlightedCursorIndex={highlightedCursorIndex}
    />
  ) : metadata?.rootBlock ? (
    <PlaygroundBlocksEditor
      commit={commit}
      config={metadata.config}
      document={document}
      onChange={updateDocumentContent}
      project={project}
      readOnlyMessage={readOnlyMessage}
      rootBlock={metadata.rootBlock}
    />
  ) : null
}
