import { useEvents } from '$/lib/events'
import type { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { fromBlocksToLexical } from '../state/fromBlocksToLexical'

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
      onLatteProjectChanges: ({ changes }) => {
        const updatedDocument = changes.find(
          (change) =>
            change.draftUuid === commit.uuid &&
            change.current.documentUuid === document.documentUuid,
        )?.current
        if (!updatedDocument) return
        if (updatedDocument.deletedAt) return

        editor.setEditable(false)
      },
    },
    [editor, commit, document, readOnly],
  )

  return null
}
