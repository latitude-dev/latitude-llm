import { useEvents } from '$/lib/events'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fromBlocksToLexical } from '../state/fromBlocksToLexical'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export function SyncChangesPlugin({
  commit,
  document,
  readOnly,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  readOnly: boolean
}) {
  const [editor] = useLexicalComposerContext()

  useEvents(
    {
      onPromptMetadataChanged: async ({ promptLoaded, metadata }) => {
        if (!promptLoaded || !metadata) return
        if (!metadata?.rootBlock) return
        if (metadata?.origin === 'blocksEditor') return
        if (metadata?.origin !== 'latteCopilot') return

        editor.getEditorState().read(() => {
          editor.update(() => {
            fromBlocksToLexical(metadata.rootBlock!, readOnly)(editor)
          })
        })
        editor.setEditable(!readOnly)
      },
    },
    [editor, commit, document, readOnly],
  )

  return null
}
