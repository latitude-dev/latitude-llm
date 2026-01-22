import { useDevMode } from '$/hooks/useDevMode'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useMetadata } from '$/hooks/useMetadata'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { memo, useMemo } from 'react'
import { PlaygroundBlocksEditor } from '../BlocksEditor'
import { PlaygroundTextEditor } from '../TextEditor'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export const Editors = memo(function Editors({
  document,
}: {
  document: DocumentVersion
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { devMode } = useDevMode()
  const { metadata } = useMetadata()
  const { value, updateDocumentContent, isSaved, diffOptions } =
    useDocumentValue()

  const readOnlyMessage = useMemo(() => {
    if (commit.mergedAt !== null) {
      return 'Version published. Create a draft to edit prompts.'
    }

    if (diffOptions) {
      return 'Keep or undo changes to edit prompts.'
    }

    return undefined
  }, [commit.mergedAt, diffOptions])

  return devMode || diffOptions ? (
    <PlaygroundTextEditor
      copilotEnabled={false}
      compileErrors={metadata?.errors}
      project={project}
      document={document}
      commit={commit}
      value={value}
      defaultValue={document.content}
      readOnlyMessage={readOnlyMessage}
      isSaved={isSaved}
      onChange={updateDocumentContent}
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
})
