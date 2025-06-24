import React, { useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import DragHandle from '@tiptap/extension-drag-handle-react'
import { Dropcursor } from '@tiptap/extension-dropcursor'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import AutoJoiner from 'tiptap-extension-auto-joiner' // optional

import { cn } from '../../../../lib/utils'

import { BlocksEditorProps, JSONContent } from '../types'
import { PromptReference } from './extensions/PromptReference'
import { StepReference } from './extensions/StepReference'
import { MessageReference } from './extensions/MessageReference'
import { initLowLight } from '../syntax/promptlSyntax'
import { Icon } from '../../../atoms/Icons'
import { recalculateColors } from '../../../../lib/monacoEditor/language'

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
  const [colors] = useState(recalculateColors())
  const ref = useRef<HTMLDivElement>(null)
  const editor = useEditor({
    immediatelyRender: false,
    onDrop: (event) => {
      console.log('Drop event:', event)
    },
    extensions: [
      // Root Document is mandatory
      Document.configure({ content: 'block+' }),
      Paragraph,
      Text,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'promptl',
        HTMLAttributes: {
          class: 'bg-backgroundCode border border-border rounded-sm p-2',
        },
      }),
      Dropcursor.configure({ width: 2, color: colors.primary }),
      Placeholder.configure({
        placeholder,
        includeChildren: true,
        showOnlyCurrent: true,
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty-node',
      }),
      GlobalDragHandle,
      AutoJoiner,

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
          'py-4 latitude-blocks-editor space-y-3',
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
    <div ref={ref} className='relative h-full flex flex-col'>
      {editor ? (
        <DragHandle editor={editor}>
          <span className='absolute inset-y-[-8px] inset-x-[-8px] bg-red-400/65' />
          <Icon name='gridVertical' color='foregroundMuted' />
        </DragHandle>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
}
