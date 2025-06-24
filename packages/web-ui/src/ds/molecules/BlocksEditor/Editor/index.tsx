import React, { useCallback, useState } from 'react'
import { $getRoot, EditorState, $isParagraphNode } from 'lexical'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { cn } from '../../../../lib/utils'
import { BlocksEditorProps } from '../types'

import {
  BlocksPlugin,
  InitializeBlocksPlugin,
  HierarchyValidationPlugin,
} from './plugins/BlocksPlugin'
import { EnterKeyPlugin } from './plugins/EnterKeyPlugin'
import { DraggableBlockPlugin } from './plugins/DraggableBlockPlugin'
import { StepNameEditPlugin } from './plugins/StepNameEditPlugin'
import { BlocksToolbar } from './components/BlocksToolbar'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { MessageBlockNode } from './nodes/MessageBlock'
import { StepBlockNode } from './nodes/StepBlock'
import {
  $isMessageBlockNode,
  $isStepBlockNode,
  VERTICAL_SPACE_CLASS,
} from './nodes/utils'
import { InsertEmptyLinePlugin } from './plugins/InsertEmptyLinePlugin'

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  paragraph: 'block-paragraph text-sm leading-relaxed',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    strikethrough: 'line-through',
    subscript: 'text-xs align-sub',
    superscript: 'text-xs align-super',
    underline: 'underline',
    underlineStrikethrough: 'underline line-through',
  },
}

function OnChangeHandler({
  onChange,
  onBlocksChange,
}: {
  onChange?: (content: string) => void
  onBlocksChange?: (blocks: AnyBlock[]) => void
}) {
  const [_editor] = useLexicalComposerContext()

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        if (onChange) {
          const root = $getRoot()
          const textContent = root.getTextContent()
          onChange(textContent)
        }

        // Move to a separate function to handle blocks conversion
        // This can be tested
        if (onBlocksChange) {
          const root = $getRoot()
          const blocks: AnyBlock[] = []

          // Convert Lexical nodes to AnyBlock[] format
          root.getChildren().forEach((node) => {
            if ($isMessageBlockNode(node)) {
              // Message block
              const messageBlock: AnyBlock = {
                id: crypto.randomUUID(),
                type: node.getRole(),
                children: [],
              }

              // Get message children
              node.getChildren().forEach((child: any) => {
                if ($isParagraphNode(child)) {
                  const textContent = child.getTextContent()
                  if (textContent.trim()) {
                    messageBlock.children.push({
                      id: crypto.randomUUID(),
                      type: 'text',
                      content: textContent,
                    })
                  }
                }
              })

              blocks.push(messageBlock)
            } else if ($isStepBlockNode(node)) {
              // Step block
              const stepBlock: AnyBlock = {
                id: crypto.randomUUID(),
                type: 'step',
                children: [],
                attributes: {
                  as: node.getStepName(),
                },
              }

              // Get step children
              node.getChildren().forEach((child: any) => {
                if ($isMessageBlockNode(child)) {
                  const messageBlock: any = {
                    id: crypto.randomUUID(),
                    type: child.getRole(),
                    children: [],
                  }

                  // Get message children
                  child.getChildren().forEach((grandchild: any) => {
                    if ($isParagraphNode(grandchild)) {
                      const textContent = grandchild.getTextContent()
                      if (textContent.trim()) {
                        messageBlock.children.push({
                          id: crypto.randomUUID(),
                          type: 'text',
                          content: textContent,
                        })
                      }
                    }
                  })

                  if (messageBlock.children.length > 0) {
                    stepBlock.children?.push(messageBlock)
                  }
                } else if ($isParagraphNode(child)) {
                  const textContent = child.getTextContent()
                  if (textContent.trim()) {
                    stepBlock.children?.push({
                      id: crypto.randomUUID(),
                      type: 'text',
                      content: textContent,
                    })
                  }
                }
              })

              blocks.push(stepBlock)
            } else if ($isParagraphNode(node)) {
              // Regular paragraph node at root level
              const textContent = node.getTextContent()
              if (textContent.trim()) {
                blocks.push({
                  id: crypto.randomUUID(),
                  type: 'text',
                  content: textContent,
                })
              }
            }
          })

          onBlocksChange(blocks)
        }
      })
    },
    [onChange, onBlocksChange],
  )

  return <OnChangePlugin onChange={handleChange} />
}

export function BlocksEditor({
  placeholder = 'Start typing...',
  initialValue = [],
  onChange,
  onBlocksChange,
  className,
  readOnly = false,
  autoFocus = false,
}: BlocksEditorProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)

  const onRef = useCallback((floatingAnchorElem: HTMLDivElement) => {
    if (floatingAnchorElem !== null) {
      setFloatingAnchorElem(floatingAnchorElem)
    }
  }, [])

  const initialConfig = {
    namespace: 'BlocksEditor',
    theme,
    onError: (error: Error) => {
      console.error('Editor error:', error)
    },
    editable: !readOnly,
    nodes: [MessageBlockNode, StepBlockNode],
  }

  return (
    <div
      className={cn(
        'relative border border-gray-200 rounded-lg bg-white',
        'focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
        className,
      )}
    >
      <LexicalComposer initialConfig={initialConfig}>
        {/* Toolbar */}
        {!readOnly && <BlocksToolbar />}

        <div className='relative' ref={onRef}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  'min-h-[300px] py-4 [&_>*]:px-4 outline-none resize-none text-sm leading-relaxed',
                  'focus:outline-none',
                  VERTICAL_SPACE_CLASS,
                  {
                    'cursor-default': readOnly,
                  },
                )}
                aria-placeholder={placeholder}
                placeholder={
                  <div className='absolute top-4 left-4 text-gray-400 pointer-events-none select-none'>
                    {placeholder}
                  </div>
                }
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Core Plugins */}
          <HistoryPlugin />
          <BlocksPlugin />
          <EnterKeyPlugin />
          <InsertEmptyLinePlugin />
          <StepNameEditPlugin />
          <InitializeBlocksPlugin initialBlocks={initialValue} />
          <HierarchyValidationPlugin />

          {/* Drag and Drop Plugin */}
          {!readOnly && floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}

          {/* Auto focus */}
          {autoFocus && <AutoFocusPlugin />}

          {/* Change handler */}
          <OnChangeHandler
            onChange={onChange}
            onBlocksChange={onBlocksChange}
          />
        </div>
      </LexicalComposer>
    </div>
  )
}
