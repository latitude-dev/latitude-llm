import React, { useRef, useState, useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getNearestNodeFromDOMNode } from 'lexical'

import { DraggableBlockPlugin_EXPERIMENTAL } from '../overrides/plugins/DraggableBlockPlugin'
import { $isParagraphNode, LexicalNode } from 'lexical'

import { Icon } from '../../../../atoms/Icons'
import { cn } from '../../../../../lib/utils'
import { $isStepBlockNode } from '../nodes/StepBlock'
import { $isMessageBlockNode } from '../nodes/MessageBlock'
import { $isCodeNode } from '@lexical/code'

const DRAGGABLE_BLOCK_MENU_CLASSNAME = 'draggable-block-menu'

function isOnMenu(element: HTMLElement): boolean {
  return !!element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`)
}

interface DraggableBlockPluginProps {
  anchorElem?: HTMLElement
}

export function DraggableBlockPlugin({
  anchorElem = document.body,
}: DraggableBlockPluginProps) {
  const [editor] = useLexicalComposerContext()
  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)
  const [draggableElement, setDraggableElement] = useState<HTMLElement | null>(
    null,
  )

  function insertBlock(e: React.MouseEvent) {
    if (!draggableElement || !editor) {
      return
    }

    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableElement)
      if (!node) {
        return
      }

      const pNode = $createParagraphNode()
      if (e.altKey || e.ctrlKey) {
        node.insertBefore(pNode)
      } else {
        node.insertAfter(pNode)
      }
      pNode.select()
    })
  }

  const canDropInside = useCallback((node: LexicalNode) => {
    if ($isParagraphNode(node)) {
      const parent = node.getParent()
      if (!parent) return false

      return $isStepBlockNode(parent) || $isMessageBlockNode(parent)
    }

    return $isStepBlockNode(node) || $isMessageBlockNode(node)
  }, [])

  const validateDrop = useCallback(
    (draggedNode: LexicalNode, targetNode: LexicalNode) => {
      // Never drop targets
      if ($isParagraphNode(targetNode)) return false
      if ($isCodeNode(targetNode)) return false

      // Handle direct drops onto custom blocks
      if ($isMessageBlockNode(targetNode)) {
        // Message blocks can only contain paragraphs (no custom blocks)
        return $isParagraphNode(draggedNode)
      }

      if ($isStepBlockNode(targetNode)) {
        // Step blocks can contain message blocks and paragraphs, but not other step blocks
        return $isParagraphNode(draggedNode) || $isMessageBlockNode(draggedNode)
      }

      // Root level or other contexts - allow all block types
      return true
    },
    [],
  )

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div
          ref={menuRef}
          className={cn(
            DRAGGABLE_BLOCK_MENU_CLASSNAME,
            'rounded p-0.5 cursor-grab absolute -left-4 top-0',
            'will-change-transform flex gap-0.5 bg-white border border-gray-200',
            'active:cursor-grabbing shadow-sm z-10',
          )}
        >
          <button
            type='button'
            title='Click to add below'
            className={cn(
              'inline-block border-none cursor-pointer bg-transparent',
              'rounded flex items-center justify-center',
            )}
            onClick={insertBlock}
          >
            <Icon name='plus' color='foregroundMuted' />
          </button>
          <div className='flex items-center justify-center'>
            <Icon name='gridVertical' color='foregroundMuted' />
          </div>
        </div>
      }
      targetLineComponent={
        <div
          ref={targetLineRef}
          className={cn(
            'pointer-events-none bg-sky-400 h-1 absolute left-0 top-0',
            'opacity-0 will-change-transform',
          )}
        />
      }
      isOnMenu={isOnMenu}
      onElementChanged={setDraggableElement}
      canDropInside={canDropInside}
      validateDrop={validateDrop}
    />
  )
}
