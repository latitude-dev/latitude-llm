import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { cn } from '../../../../lib/utils'

export interface TextBlockComponentProps extends NodeViewProps {
  // Additional props can be added here
}

export const TextBlockComponent: React.FC<TextBlockComponentProps> = ({
  node,
  updateAttributes,
  editor,
  getPos,
  selected,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = useState(node.attrs.content || '')
  const [isFocused, setIsFocused] = useState(false)
  const errors = node.attrs.errors || []
  const hasErrors = Array.isArray(errors) && errors.length > 0

  // Sync content with node attributes
  useEffect(() => {
    setContent(node.attrs.content || '')
  }, [node.attrs.content])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [content, adjustTextareaHeight])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    
    // Update the node attributes
    updateAttributes({
      content: newContent,
    })

    // Update the editor content using the command
    if (node.attrs.id) {
      editor.commands.updateTextBlockContent(node.attrs.id, newContent)
    }
  }, [updateAttributes, editor, node.attrs.id])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle special key behaviors
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      // Cmd/Ctrl + Enter: Create new block
      e.preventDefault()
      const pos = getPos()
      if (typeof pos === 'number') {
        editor.commands.insertContentAt(pos + node.nodeSize, {
          type: 'textBlock',
          attrs: {
            id: `text_${Date.now()}`,
            content: '',
          },
        })
      }
    } else if (e.key === 'Backspace' && content === '' && !e.shiftKey) {
      // Delete empty block
      e.preventDefault()
      const pos = getPos()
      if (typeof pos === 'number') {
        editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize })
      }
    }
  }, [content, editor, getPos, node.nodeSize])

  return (
    <NodeViewWrapper
      className={cn(
        'text-block-wrapper',
        'relative rounded-md border border-gray-200 p-3 transition-colors',
        {
          'border-blue-500 ring-2 ring-blue-500/20': selected || isFocused,
          'border-red-500 ring-2 ring-red-500/20': hasErrors,
          'hover:border-gray-300': !selected && !isFocused && !hasErrors,
        }
      )}
      data-type="text-block"
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full resize-none border-0 bg-transparent p-0 text-sm',
            'placeholder-gray-400 focus:outline-none focus:ring-0',
            'min-h-[24px]'
          )}
          placeholder="Enter text..."
          rows={1}
        />
        
        {/* Error indicator */}
        {hasErrors && (
          <div className="absolute -top-1 -right-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
          </div>
        )}
      </div>

      {/* Error messages */}
      {hasErrors && (
        <div className="mt-2 space-y-1">
          {errors.map((error: any, index: number) => (
            <div
              key={index}
              className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded"
            >
              {error.message}
            </div>
          ))}
        </div>
      )}

      {/* Block info */}
      {(selected || isFocused) && (
        <div className="absolute -top-6 left-0 text-xs text-gray-500 bg-white px-1 rounded">
          Text Block {node.attrs.id && `(${node.attrs.id})`}
        </div>
      )}
    </NodeViewWrapper>
  )
}
