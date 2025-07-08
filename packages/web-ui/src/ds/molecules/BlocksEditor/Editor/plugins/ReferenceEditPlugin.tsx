import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { useEffect } from 'react'
import { $isReferenceNode } from '../nodes/ReferenceNode'
import { buildReferencePath } from './ReferencesPlugin'

export function ReferenceEditPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const abortController = new AbortController()

    const handleReferencePathUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeKey: string
        newPath: string
      }>
      const { nodeKey, newPath } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isReferenceNode(node)) {
          node.setPath(buildReferencePath(newPath))
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
  }, [editor])

  return null
}

export function triggerReferencePathUpdate(nodeKey: string, newPath: string) {
  const event = new CustomEvent('reference-path-update', {
    detail: { nodeKey, newPath },
  })
  document.dispatchEvent(event)
}
