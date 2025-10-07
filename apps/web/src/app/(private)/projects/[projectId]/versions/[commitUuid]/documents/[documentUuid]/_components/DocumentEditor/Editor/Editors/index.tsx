import { useDevMode } from '$/hooks/useDevMode'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useMetadata } from '$/hooks/useMetadata'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useEffect, useMemo, useState } from 'react'
import { PlaygroundBlocksEditor } from '../BlocksEditor'
import { PlaygroundTextEditor } from '../TextEditor'
import { useLatteDiff } from '$/hooks/useLatteDiff'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import { DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'

export function Editors({
  document,
  refinementEnabled,
}: {
  document: DocumentVersion
  refinementEnabled: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { devMode, setDevMode } = useDevMode()
  const { metadata } = useMetadata()
  const { value, updateDocumentContent, isSaved } = useDocumentValue()
  const { diff: latteDiff } = useLatteDiff()
  const [experimentDiff, setEditorDiff] = useState<DiffOptions | undefined>()
  const readOnlyMessage = useMemo(() => {
    if (commit.mergedAt !== null) {
      return 'Version published. Create a draft to edit prompts.'
    }

    if (latteDiff) {
      return 'Keep or undo changes to edit prompts.'
    }

    return undefined
  }, [commit.mergedAt, latteDiff])
  const diff = useMemo(
    () => experimentDiff ?? latteDiff,
    [experimentDiff, latteDiff],
  )

  useEffect(() => {
    if (!diff) return
    if (devMode) return

    setDevMode(true)
  }, [setDevMode, devMode, diff])

  return devMode ? (
    <PlaygroundTextEditor
      copilotEnabled={false}
      refinementEnabled={refinementEnabled}
      compileErrors={metadata?.errors}
      project={project}
      document={document}
      commit={commit}
      setDiff={setEditorDiff}
      diff={diff}
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
}
