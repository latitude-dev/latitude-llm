import React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'

import {
  AnyBlock,
  simpleBlocksToText,
} from '@latitude-data/constants/simpleBlocks'

import { TextBlockExtension } from './extensions/Text/extension'
import { BlocksEditorProps } from '../types'

export function BlocksEditor({
  onUpdate,
  placeholder,
  editable = true,
}: BlocksEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [TextBlockExtension],
    content: {
      type: 'doc',
      content: [
        {
          type: 'textBlock',
          attrs: {
            id: `text_${Date.now()}`,
            content: 'Hola',
          },
          content: [],
        },
      ],
    },
    editable,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      onUpdate(simpleBlocksToText(json as unknown as AnyBlock[]))
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none`,
        'data-placeholder': placeholder,
      },
    },
  })

  return <EditorContent editor={editor} />
}
