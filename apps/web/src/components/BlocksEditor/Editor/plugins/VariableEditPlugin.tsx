import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  TextNode,
} from 'lexical'
import { useEffect } from 'react'
import { VariableNode } from '../nodes/VariableNode'

/**
 * Checks if a node is a VariableNode
 */
function $isVariableNode(node: any): node is VariableNode {
  return node instanceof VariableNode
}

/**
 * Trims one brace from a VariableNode, converting it to text
 * @param variableNode - The VariableNode to modify
 * @param trimFrom - Which end to trim from: 'start' or 'end'
 */
function trimVariableBrace(
  variableNode: VariableNode,
  trimFrom: 'start' | 'end',
) {
  const variableName = variableNode.__name
  let textContent: string

  if (trimFrom === 'start') {
    // Remove opening braces: {{variable}} -> {variable}}
    textContent = `{${variableName}}}`
  } else {
    // Remove closing braces: {{variable}} -> {{variable}
    textContent = `{{${variableName}}`
  }

  const textNode = new TextNode(textContent)

  // Replace the variable node with the text node
  variableNode.replace(textNode)

  // Position cursor appropriately
  if (trimFrom === 'start') {
    // Position at the start of the remaining text
    textNode.select(0, 0)
  } else {
    // Position at the end of the remaining text
    textNode.select(textContent.length, textContent.length)
  }
}

export function VariableEditPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Handle backspace key
    const removeBackspaceListener = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection()

        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()
          const offset = anchor.offset

          // Case 1: Cursor is directly on the VariableNode
          if ($isVariableNode(anchorNode)) {
            event.preventDefault?.()
            editor.update(() => {
              trimVariableBrace(anchorNode, 'start')
            })
            return true
          }

          // Case 2: Cursor is in a TextNode at position 0 (right after a VariableNode)
          if (anchorNode instanceof TextNode && offset === 0) {
            // Walk backwards through sibling nodes to find a VariableNode
            let currentNode = anchorNode.getPreviousSibling()
            let walkCount = 0
            while (currentNode && walkCount < 5) {
              // Safety limit
              if ($isVariableNode(currentNode)) {
                event.preventDefault?.()
                editor.update(() => {
                  trimVariableBrace(currentNode as VariableNode, 'end')
                })
                return true
              }
              // Stop if we hit a non-empty TextNode (don't skip over content)
              if (
                currentNode instanceof TextNode &&
                currentNode.getTextContent().trim() !== ''
              ) {
                break
              }
              currentNode = currentNode.getPreviousSibling()
              walkCount++
            }
          }

          // Case 3: Cursor is in a ParagraphNode (block level)
          if (
            anchorNode.getType() === 'paragraph' &&
            anchorNode instanceof ElementNode
          ) {
            const children = anchorNode.getChildren()

            // Check if the child at offset-1 is a VariableNode (cursor right after variable)
            if (offset > 0 && offset <= children.length) {
              const previousChild = children[offset - 1]
              if ($isVariableNode(previousChild)) {
                event.preventDefault?.()
                editor.update(() => {
                  trimVariableBrace(previousChild as VariableNode, 'end')
                })
                return true
              }
            }
          }
        }

        // Let Lexical handle normal text editing for everything else
        return false
      },
      COMMAND_PRIORITY_CRITICAL,
    )

    // Handle delete key
    const removeDeleteListener = editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => {
        const selection = $getSelection()

        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()
          const offset = anchor.offset

          // Case 1: Cursor is directly on the VariableNode
          if ($isVariableNode(anchorNode)) {
            event.preventDefault?.()
            editor.update(() => {
              trimVariableBrace(anchorNode, 'end')
            })
            return true
          }

          // Case 2: Cursor is in a TextNode at the end (right before a VariableNode)
          if (anchorNode instanceof TextNode) {
            const textContent = anchorNode.getTextContent()
            if (offset === textContent.length) {
              // Walk forwards through sibling nodes to find a VariableNode
              let currentNode = anchorNode.getNextSibling()
              while (currentNode) {
                if ($isVariableNode(currentNode)) {
                  event.preventDefault?.()
                  editor.update(() => {
                    trimVariableBrace(currentNode as VariableNode, 'start')
                  })
                  return true
                }
                // Stop if we hit a non-empty TextNode (don't skip over content)
                if (
                  currentNode instanceof TextNode &&
                  currentNode.getTextContent().trim() !== ''
                ) {
                  break
                }
                currentNode = currentNode.getNextSibling()
              }
            }
          }

          // Case 3: Cursor is in a ParagraphNode (block level)
          if (
            anchorNode.getType() === 'paragraph' &&
            anchorNode instanceof ElementNode
          ) {
            const children = anchorNode.getChildren()

            // Check if the child at offset is a VariableNode (cursor right before variable)
            if (offset >= 0 && offset < children.length) {
              const nextChild = children[offset]
              if ($isVariableNode(nextChild)) {
                event.preventDefault?.()
                editor.update(() => {
                  trimVariableBrace(nextChild as VariableNode, 'start')
                })
                return true
              }
            }
          }
        }

        // Let Lexical handle normal text editing for everything else
        return false
      },
      COMMAND_PRIORITY_CRITICAL,
    )

    return () => {
      removeBackspaceListener()
      removeDeleteListener()
    }
  }, [editor])

  return null
}
