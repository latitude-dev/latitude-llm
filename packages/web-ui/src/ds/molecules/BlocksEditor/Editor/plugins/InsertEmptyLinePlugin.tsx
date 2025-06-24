import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
} from 'lexical'
import { $findMatchingParent } from '@lexical/utils'
import { Icon } from '../../../../atoms/Icons'
import { $isMessageBlockNode, $isStepBlockNode } from '../nodes/utils'

interface BlockWithCursor {
  blockKey: string
  blockElement: HTMLElement
  rect: DOMRect
}

/**
 * Plugin to insert an empty paragraph above the current block
 * It's hard otherwise to insert a new paragraph above a block
 */
export function InsertEmptyLinePlugin() {
  const [editor] = useLexicalComposerContext()
  const [activeBlock, setActiveBlock] = useState<BlockWithCursor | null>(null)

  useEffect(() => {
    const updateActiveBlock = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setActiveBlock(null)
          return
        }

        // Find if the cursor is inside a message or step block
        const anchorNode = selection.anchor.getNode()
        const focusNode = selection.focus.getNode()

        // Check if either anchor or focus is in a block
        const blockNode =
          $findMatchingParent(
            anchorNode,
            (node) => $isMessageBlockNode(node) || $isStepBlockNode(node),
          ) ||
          $findMatchingParent(
            focusNode,
            (node) => $isMessageBlockNode(node) || $isStepBlockNode(node),
          )

        if (blockNode) {
          const blockKey = blockNode.getKey()
          const blockElement = editor.getElementByKey(blockKey)

          if (blockElement) {
            const rect = blockElement.getBoundingClientRect()
            setActiveBlock({
              blockKey,
              blockElement,
              rect,
            })
          }
        } else {
          setActiveBlock(null)
        }
      })
    }

    // Listen to selection changes
    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateActiveBlock()
      })
    })

    // Initial check
    updateActiveBlock()

    return removeListener
  }, [editor])

  const handleInsertAbove = () => {
    if (!activeBlock) return

    editor.update(() => {
      // Find the block node by key in the Lexical tree
      const blockNode = $getNodeByKey(activeBlock.blockKey)

      if (
        !blockNode ||
        (!$isMessageBlockNode(blockNode) && !$isStepBlockNode(blockNode))
      ) {
        return
      }

      // Create a new paragraph and insert it before the block
      const newParagraph = $createParagraphNode()
      newParagraph.append($createTextNode(''))

      blockNode.insertBefore(newParagraph)

      // Focus the new paragraph
      newParagraph.selectStart()
    })
  }

  if (!activeBlock) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: activeBlock.rect.right - 12, // Position so button center aligns with right edge of block
        top: activeBlock.rect.top - 12, // Half of button height (24px/2 = 12px) above the block
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      <button
        className='flex items-center justify-center w-6 h-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-md transition-colors duration-200'
        onClick={handleInsertAbove}
        title='Insert paragraph above this block'
      >
        <Icon name='arrowUp' color='white' size='xsmall' />
      </button>
    </div>
  )
}
