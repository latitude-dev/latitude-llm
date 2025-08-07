import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey } from 'lexical'
import { MessageBlockType } from '../state/promptlToLexical/types'
import { $isMessageBlockNode } from '../nodes/MessageBlock'

export function MessageEditPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const abortController = new AbortController()

    const handleMessageRoleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeKey: string
        newRole: MessageBlockType
      }>
      const { nodeKey, newRole } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isMessageBlockNode(node)) {
          node.setRole(newRole)
        }
      })
    }

    const handleDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeKey: string }>
      const { nodeKey } = customEvent.detail

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isMessageBlockNode(node)) {
          node.remove()
        }
      })
    }

    document.addEventListener('message-role-update', handleMessageRoleUpdate, {
      signal: abortController.signal,
    })

    document.addEventListener('message-delete', handleDelete, {
      signal: abortController.signal,
    })

    return () => {
      abortController.abort()
    }
  }, [editor])

  return null
}

export function triggerMessageRoleUpdate(
  nodeKey: string,
  newRole: MessageBlockType,
) {
  const event = new CustomEvent('message-role-update', {
    detail: { nodeKey, newRole },
  })
  document.dispatchEvent(event)
}

export function triggerMessageDelete(nodeKey: string) {
  const event = new CustomEvent('message-delete', {
    detail: { nodeKey },
  })
  document.dispatchEvent(event)
}
