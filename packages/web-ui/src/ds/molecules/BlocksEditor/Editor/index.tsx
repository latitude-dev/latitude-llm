import React, { useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'

import { cn } from '../../../../lib/utils'

import {
  AnyBlock,
  simpleBlocksToText,
} from '@latitude-data/constants/simpleBlocks'

import { BlocksEditorProps } from '../types'

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
      Document,
      Text,
      Paragraph,
      Placeholder.configure({
        placeholder,
        emptyNodeClass: 'is-empty-node',
        showOnlyWhenEditable: true,
      }),
    ],
    content: {
      type: 'doc',
      content,
    },
    editable,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      onUpdate(json.content)
    },
    editorProps: {
      attributes: {
        class: cn(
          'font-mono text-sm leading-tight whitespace-pre outline-none',
          '[&_.is-empty-node]:before:content-[attr(data-placeholder)]',
          '[&_.is-empty-node]:before:text-muted-foreground',
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
        'relative h-full rounded-lg border border-border bg-backgroundCode',
        'overflow-hidden flex flex-col py-4 px-3',
      )}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
