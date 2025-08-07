import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { useEffect } from 'react'
import { $isStepBlockNode } from '../nodes/StepBlock'

export function StepEditPlugin() {
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

    const handleStepIsolateUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeKey: string
        newIsolate: boolean
      }>
      const { nodeKey, newIsolate } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isStepBlockNode(node)) {
          node.setIsolated(newIsolate)
        }
      })
    }

    const handleStepDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeKey: string }>
      const { nodeKey } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isStepBlockNode(node)) {
          node.remove()
        }
      })
    }

    document.addEventListener('step-name-update', handleStepNameUpdate, {
      signal: abortController.signal,
    })

    document.addEventListener('step-isolate-update', handleStepIsolateUpdate, {
      signal: abortController.signal,
    })

    document.addEventListener('step-delete', handleStepDelete, {
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

export function triggerStepIsolateUpdate(nodeKey: string, newIsolate: boolean) {
  const event = new CustomEvent('step-isolate-update', {
    detail: { nodeKey, newIsolate },
  })
  document.dispatchEvent(event)
}

export function triggerStepDelete(nodeKey: string) {
  const event = new CustomEvent('step-delete', {
    detail: { nodeKey },
  })
  document.dispatchEvent(event)
}
