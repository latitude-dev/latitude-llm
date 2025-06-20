import React, { useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'

import { cn } from '../../../../lib/utils'

import { BlocksEditorProps, JSONContent } from '../types'
import { PromptReference } from './extensions/PromptReference'
import { StepReference } from './extensions/StepReference'
import { MessageReference } from './extensions/MessageReference'
import { initLowLight } from '../syntax/promptlSyntax'

function ensureTrailingParagraph(content: JSONContent[] = []): JSONContent[] {
  const last = content[content.length - 1]
  if (!last || last.type !== 'paragraph') {
    return [...content, { type: 'paragraph', content: [] }]
  }
  return content
}
const lowlight = initLowLight()

export function BlocksEditor({
  onUpdate,
  placeholder,
  editable = true,
  content,
}: BlocksEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Root Document is mandatory
      Document.configure({ content: 'block+' }),

      // Builtin extensions
      Text,
      Paragraph,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'promptl',
        HTMLAttributes: { class: 'bg-backgroundCode border border-border rounded-sm p-2' },
      }),
      Placeholder.configure({
        placeholder,
        includeChildren: true,
        showOnlyCurrent: true,
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty-node',
      }),

      // Latitude extensions
      PromptReference,
      StepReference,
      MessageReference,
    ],
    content: {
      type: 'doc',
      content: ensureTrailingParagraph(content),
    },
    editable,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      onUpdate(json.content)
    },
    editorProps: {
      attributes: {
        class: cn(
          'latitude-blocks-editor space-y-2',
          '[&_p]:text-muted-foreground',
          'font-mono text-sm leading-tight whitespace-pre outline-none',
          '[&_.is-empty-node]:before:content-[attr(data-placeholder)]',
          '[&_.is-empty-node]:before:text-muted-foreground/60',
          '[&_.is-empty-node]:pointer-events-none',
          '[&_.is-empty-node]:before:absolute',
        ),
        'data-placeholder': placeholder,
      },
    },
  })

  return (
    <div
      ref={ref}
      className={cn(
        'relative h-full',
        'overflow-hidden flex flex-col',
        'text-muted-all',
      )}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
