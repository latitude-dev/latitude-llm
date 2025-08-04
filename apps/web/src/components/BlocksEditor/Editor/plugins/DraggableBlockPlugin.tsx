import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
} from 'lexical'
import { MouseEvent, useCallback, useRef, useState } from 'react'

import { $isParagraphNode, LexicalNode } from 'lexical'
import { DraggableBlockPlugin_EXPERIMENTAL } from '../overrides/plugins/DraggableBlockPlugin'

import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'
import { $isCodeNode } from '@lexical/code'
import { $isMessageBlockNode } from '../nodes/MessageBlock'
import { $isStepBlockNode } from '../nodes/StepBlock'

const DRAGGABLE_BLOCK_MENU_CLASSNAME = 'draggable-block-menu'

function isOnMenu(element: HTMLElement): boolean {
  return !!element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`)
}

interface DraggableBlockPluginProps {
  anchorElem?: HTMLElement
}

export function DraggableBlockPlugin(_p: DraggableBlockPluginProps) {
  const [editor] = useLexicalComposerContext()
  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)
  const [draggableElement, setDraggableElement] = useState<HTMLElement | null>(
    null,
  )

  const insertBlock = useCallback(
    (e: MouseEvent) => {
      if (!draggableElement || !editor) {
        return
      }

      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(draggableElement)
        if (!node) return

        // When in an empty paragraph, insert a new paragraph with a slash
        if ($isParagraphNode(node) && node.getTextContent() === '') {
          node.append($createTextNode('/'))
          node.select()
          return
        }

        const pNode = $createParagraphNode()
        pNode.append($createTextNode('/'))
        if (e.altKey || e.ctrlKey) {
          node.insertBefore(pNode)
        } else {
          node.insertAfter(pNode)
        }
        pNode.select()
      })
    },
    [draggableElement, editor],
  )

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
      anchorElem={document.body}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponentWidth={44}
      menuComponent={
        <div
          ref={menuRef}
          className={cn(
            DRAGGABLE_BLOCK_MENU_CLASSNAME,
            'absolute pr-1 top-0 z-[1000]',
          )}
        >
          <div
            className={cn(
              'rounded p-0.5 cursor-grab bg-background',
              'will-change-transform flex gap-0.5 border border-border',
              'active:cursor-grabbing shadow-sm z-10',
            )}
          >
            <Tooltip
              asChild
              trigger={
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
              }
            >
              Press "Alt" (Option) to insert above
            </Tooltip>
            <div className='flex items-center justify-center'>
              <Icon name='gridVertical' color='foregroundMuted' />
            </div>
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
