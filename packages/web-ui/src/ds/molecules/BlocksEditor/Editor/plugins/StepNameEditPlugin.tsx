import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { useEffect } from 'react'
import { $isStepBlockNode } from '../nodes/StepBlock'

export function StepNameEditPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const abortController = new AbortController()

    const handleStepNameUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeKey: string
        newName: string
      }>
      const { nodeKey, newName } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isStepBlockNode(node)) {
          node.setStepName(newName)
        }
      })
    }

    document.addEventListener('step-name-update', handleStepNameUpdate, {
      signal: abortController.signal,
    })

    return () => {
      abortController.abort()
    }
  }, [editor])

  return null
}

export function triggerStepNameUpdate(nodeKey: string, newName: string) {
  const event = new CustomEvent('step-name-update', {
    detail: { nodeKey, newName },
  })
  document.dispatchEvent(event)
}
