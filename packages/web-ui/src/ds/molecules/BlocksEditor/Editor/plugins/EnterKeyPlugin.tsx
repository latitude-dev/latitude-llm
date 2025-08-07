import { $isCodeNode } from '@lexical/code'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { useEffect } from 'react'
import { $isMessageBlockNode } from '../nodes/MessageBlock'
import { $isStepBlockNode } from '../nodes/StepBlock'

export function EnterKeyPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const removeEnterListener = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (_event) => {
        let shouldHandle = false

        editor.getEditorState().read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return

          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          // Find the block node that contains the current selection
          let currentNode = anchorNode
          let blockNode = null

          while (currentNode) {
            if (
              $isMessageBlockNode(currentNode) ||
              $isStepBlockNode(currentNode) ||
              $isCodeNode(currentNode)
            ) {
              blockNode = currentNode
              break
            }
            const parent = currentNode.getParent()

            if (!parent) break

            currentNode = parent
          }

          if (!blockNode) return

          // Check if we're at the end of the block and on an empty paragraph
          const children = blockNode.getChildren()

          const lastChild = children[children.length - 1]
          const secondLastChild =
            children.length > 1 ? children[children.length - 2] : null

          // Check if current position is at the end of the last paragraph
          if ($isParagraphNode(anchorNode) && anchorNode === lastChild) {
            const text = anchorNode.getTextContent().trim()
            const cursorOffset = anchor.offset
            const textLength = anchorNode.getTextContent().length

            if (text === '' && cursorOffset === textLength) {
              if (secondLastChild && $isParagraphNode(secondLastChild)) {
                const secondLastText = secondLastChild.getTextContent().trim()

                if (secondLastText === '') {
                  shouldHandle = true
                }
              }
            }
          }
        })
        if (!shouldHandle) return false

        // Now we perform the actual update
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return

          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          // Find the block node again
          let currentNode = anchorNode
          let blockNode = null

          while (currentNode) {
            if (
              $isMessageBlockNode(currentNode) ||
              $isStepBlockNode(currentNode)
            ) {
              blockNode = currentNode
              break
            }
            const parent = currentNode.getParent()
            if (!parent) break
            currentNode = parent
          }

          if (!blockNode) return

          const children = blockNode.getChildren()
          const lastChild = children[children.length - 1]

          if ($isParagraphNode(lastChild)) {
            const newParagraph = $createParagraphNode()
            blockNode.insertAfter(newParagraph)

            // Remove the last empty paragraph
            lastChild.remove()

            // Move selection to the new paragraph outside the block
            newParagraph.select()
          }
        })

        return true // Mark as handled to stop other listeners
      },
      COMMAND_PRIORITY_CRITICAL,
    )

    return () => {
      removeEnterListener()
    }
  }, [editor])

  return null
}
