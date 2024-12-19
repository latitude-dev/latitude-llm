'use client'

import { useRef } from 'react'
import { MonacoDiffEditor } from './DiffEditor'
import { editor } from 'monaco-editor'
import { DiffValue } from '@latitude-data/core/browser'

const SCROLLBAR_SIZE = 10

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

        /* Add padding with line numbers and adjust editor width for new scrollbar size */
        .editor.modified { left: 0.5rem !important; width: unset !important; right: ${SCROLLBAR_SIZE}px !important }
        .monaco-editor { width: unset !important; right: ${SCROLLBAR_SIZE}px !important; }
        .monaco-editor>.overflow-guard { width: unset !important; right: 0px !important; }
        .editor-scrollable { width: unset !important; right: 0px !important; }
        .view-overlays { width: 100% !important; }
        .view-zones { width: 100% !important; }
        .view-lines { width: 100% !important; }
        .lines-content { width: 100% !important; }

        .line-numbers { padding-right: 0.5rem !important; }
        .monaco-editor-overlaymessage { display: none !important; }
        .diffOverview { width: ${SCROLLBAR_SIZE}px !important; left: unset !important; right: 0! important; }
        .diffViewport { width: ${SCROLLBAR_SIZE}px !important; left: unset !important; right: 0! important; }
        .diffOverviewRuler { width: ${SCROLLBAR_SIZE / 2}px !important; }
        .diffOverviewRuler.original { right: ${SCROLLBAR_SIZE / 2}px !important; }
      `}</style>
      <MonacoDiffEditor
        editorRef={diffEditorRef}
        newValue={newValue ?? ''}
        oldValue={oldValue ?? ''}
      />
    </div>
  )
}
