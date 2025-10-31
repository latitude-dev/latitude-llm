import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { $isReferenceNode } from '../nodes/ReferenceNode'
import { buildEmptyAttributes, buildReferencePath } from './ReferencesPlugin'
import { BlocksEditorProps, IncludedPrompt } from '../../types'

export function ReferenceEditPlugin({
  onRequestPromptMetadata,
}: {
  onRequestPromptMetadata: BlocksEditorProps['onRequestPromptMetadata']
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!onRequestPromptMetadata) return

    const abortController = new AbortController()

    const handleReferencePathUpdate = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeKey: string
        newPrompt: IncludedPrompt
      }>
      const { nodeKey, newPrompt } = customEvent.detail

      const metadata = await onRequestPromptMetadata(newPrompt)
      const attrs = buildEmptyAttributes(metadata)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isReferenceNode(node)) {
          node.onChangeReference({
            path: buildReferencePath(newPrompt.path),
            attributes: attrs,
          })
        }
      })
    }

    document.addEventListener(
      'reference-path-update',
      handleReferencePathUpdate,
      {
        signal: abortController.signal,
      },
    )

    return () => {
      abortController.abort()
    }
  }, [editor, onRequestPromptMetadata])

  return null
}

export function triggerReferencePathUpdate(
  nodeKey: string,
  newPrompt: IncludedPrompt,
) {
  const event = new CustomEvent('reference-path-update', {
    detail: { nodeKey, newPrompt },
  })
  document.dispatchEvent(event)
}
