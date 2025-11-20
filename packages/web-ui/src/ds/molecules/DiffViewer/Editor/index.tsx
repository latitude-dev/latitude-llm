'use client'

import { useRef } from 'react'
import { type editor } from 'monaco-editor'
import { MonacoDiffEditor } from '../../DocumentTextEditor/Editor/DiffEditor'
import { DiffValue } from '@latitude-data/constants'

export function DiffViewer({ newValue, oldValue }: DiffValue) {
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null)

  return (
    <div className='relative h-full w-full rounded-lg border border-border overflow-hidden flex flex-col bg-secondary'>
      <style>{`
        /* Remove cursor and tooltip message when trying to modify the contents */
        .monaco-editor .cursors-layer > .cursor {
          display: none !important;
        }

        /* Remove left numbers column (unused) */
        .editor.original { display: none !important; }
      `}</style>
      <MonacoDiffEditor
        editorRef={diffEditorRef}
        newValue={newValue ?? ''}
        oldValue={oldValue ?? ''}
      />
    </div>
  )
}
