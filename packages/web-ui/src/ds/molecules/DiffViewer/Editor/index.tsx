'use client'

import { useRef } from 'react'
import { MonacoDiffEditor } from './DiffEditor'
import { editor } from 'monaco-editor'
import { DiffValue } from '@latitude-data/core/browser'

export function DiffViewer({ newValue, oldValue }: DiffValue) {
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null)

  return (
    <div className='relative h-full w-full rounded-lg border border-border overflow-hidden flex flex-col bg-secondary'>
      <style>{`
        /* Remove cursor and tooltip message when trying to modify the contents */
        .monaco-editor .cursors-layer > .cursor {
          display: none !important;
        }
        .monaco-editor-overlaymessage { display: none !important; }
      `}</style>
      <MonacoDiffEditor
        editorRef={diffEditorRef}
        newValue={newValue ?? ''}
        oldValue={oldValue ?? ''}
      />
    </div>
  )
}
