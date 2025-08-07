import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
} from 'lexical'
import { useEffect } from 'react'
import { StepBlockNode } from '../nodes/StepBlock'
import { MessageBlockNode } from '../nodes/MessageBlock'

function isBackspacePreventedForNode(
  node: LexicalNode | null,
): node is StepBlockNode | MessageBlockNode {
  return node instanceof StepBlockNode || node instanceof MessageBlockNode
}

export function PreventBackspaceEscapePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection()

        // Only act on collapsed range selections (single caret)
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          // Ascend the tree to find the nearest Block we want to prevent backspace (or bail)
          let maybeBlock: LexicalNode | null = anchorNode
          while (maybeBlock && !isBackspacePreventedForNode(maybeBlock)) {
            maybeBlock = maybeBlock.getParent()
          }

          if (isBackspacePreventedForNode(maybeBlock)) {
            const stepBlockChildren = maybeBlock.getChildren()

            if (stepBlockChildren.length > 1) return false

            const lastChild = stepBlockChildren[stepBlockChildren.length - 1]

            let directChildOfStepBlock: LexicalNode | null = anchorNode
            while (directChildOfStepBlock && directChildOfStepBlock.getParent() !== maybeBlock) {
              directChildOfStepBlock = directChildOfStepBlock.getParent()
            }

            // Only proceed if caret is in the last direct child of StepBlockNode
            if (directChildOfStepBlock === lastChild) {
              // Check if caret is at begining
              if (anchor.offset === 0) {
                // Prevent content from escaping the block!
                event.preventDefault?.()
                return true
              }
            }
          }
        }

        return false
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor])

  return null
}
