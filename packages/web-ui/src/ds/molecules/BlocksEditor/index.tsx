import React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'

// Import our custom extensions
import { DocumentExtension } from './extensions/DocumentExtension'
import { TextExtension } from './extensions/TextExtension'
import { BlocksSchema } from './extensions/BlocksSchema'
import { TextBlockExtension } from './extensions/TextBlockExtension'
import { ContentImageExtension } from './extensions/ContentImageExtension'

export interface BlocksEditorProps {
  content?: string
  onChange?: (content: string) => void
  onUpdateBlocks?: (blocks: any[]) => void
  className?: string
  placeholder?: string
  editable?: boolean
}

export const BlocksEditor: React.FC<BlocksEditorProps> = ({
  content = '',
  onChange,
  onUpdateBlocks,
  className = '',
  placeholder = 'Start typing...',
  editable = true,
}) => {
  const editor = useEditor({
    extensions: [
      // Base document structure
      DocumentExtension,
      
      // Base text handling
      TextExtension,
      
      // Our custom schema
      BlocksSchema,
      
      // Block extensions
      TextBlockExtension,
      ContentImageExtension,
    ],
    content: content || {
      type: 'doc',
      content: [
        {
          type: 'textBlock',
          attrs: {
            id: `text_${Date.now()}`,
            content: '',
          },
          content: [],
        },
      ],
    },
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const json = editor.getJSON()
      
      onChange?.(html)
      
      // Convert Tiptap JSON to our simple blocks format
      const blocks = convertTiptapToSimpleBlocks(json)
      onUpdateBlocks?.(blocks)
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none ${className}`,
        'data-placeholder': placeholder,
      },
    },
  })

  return (
    <div className="blocks-editor">
      <EditorContent editor={editor} />
      
      {/* Toolbar for adding different block types */}
      {editor && (
        <div className="toolbar mt-4 p-2 border-t border-gray-200">
          <button
            onClick={() => editor.commands.setTextBlock('')}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
          >
            + Text Block
          </button>
          <button
            onClick={() => editor.commands.setContentImage('')}
            className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 mr-2"
          >
            + Image Block
          </button>
        </div>
      )}
    </div>
  )
}

// Helper function to convert Tiptap JSON to our simple blocks format
function convertTiptapToSimpleBlocks(tiptapJson: any): any[] {
  const blocks: any[] = []
  
  if (tiptapJson.content) {
    tiptapJson.content.forEach((node: any) => {
      switch (node.type) {
        case 'textBlock':
          blocks.push({
            id: node.attrs?.id || `text_${Date.now()}`,
            type: 'text',
            content: node.attrs?.content || extractTextFromNode(node),
            errors: node.attrs?.errors || undefined,
          })
          break
          
        case 'contentImage':
          blocks.push({
            id: node.attrs?.id || `image_${Date.now()}`,
            type: 'content-image',
            content: node.attrs?.content || '',
            errors: node.attrs?.errors || undefined,
          })
          break
          
        // Add more cases for other block types as we implement them
        default: {
          // Handle unknown node types or convert to text
          const textContent = extractTextFromNode(node)
          if (textContent) {
            blocks.push({
              id: `text_${Date.now()}`,
              type: 'text',
              content: textContent,
            })
          }
          break
        }
      }
    })
  }
  
  return blocks
}

// Helper function to extract text content from a node
function extractTextFromNode(node: any): string {
  if (node.type === 'text') {
    return node.text || ''
  }
  
  if (node.content) {
    return node.content.map((child: any) => extractTextFromNode(child)).join('')
  }
  
  return ''
}

export default BlocksEditor
