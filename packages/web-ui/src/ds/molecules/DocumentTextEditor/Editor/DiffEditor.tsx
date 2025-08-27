'use client'

import { MutableRefObject, useCallback, useEffect } from 'react'

import { DiffEditor, Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'

import { TextEditorPlaceholder } from '../../TextEditorPlaceholder'
import { EditorWrapper } from './EditorWrapper'
import { useEditorOptions } from './useEditorOptions'
import { useMonacoSetup } from './useMonacoSetup'

const SCROLLBAR_SIZE = 10

export function MonacoDiffEditor({
  editorRef,
  oldValue,
  newValue,
  readOnlyMessage,
}: {
  editorRef: MutableRefObject<editor.IStandaloneDiffEditor | null>
  oldValue: string
  newValue: string
  readOnlyMessage?: string
}) {
  const { monacoRef, handleEditorWillMount } = useMonacoSetup()
  const { options } = useEditorOptions({
    renderSideBySide: false,
    scrollbar: {
      // There is already a "diff scrollbar"
      vertical: 'hidden',
      verticalScrollbarSize: 0,
      verticalSliderSize: 0,
    },
    readOnly: !!readOnlyMessage,
    readOnlyMessage: readOnlyMessage
      ? { value: readOnlyMessage, supportHtml: true }
      : undefined,
  })

  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneDiffEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = editor

      const originalEditor = editor.getOriginalEditor().getDomNode()
      if (originalEditor) {
        originalEditor.style.display = 'none'
      }

      const modifiedEditor = editor.getModifiedEditor().getDomNode()
      if (modifiedEditor) {
        modifiedEditor.style.left = '0px'
      }

      editor.layout()
    },
    [editorRef, monacoRef],
  )

  useEffect(() => {
    return () => {
      if (!editorRef.current) return

      editorRef.current.dispose()
    }
  }, [editorRef])

  return (
    <EditorWrapper>
      <style>{`
        /* Add padding with line numbers and adjust editor width for new scrollbar size */
        .editor.modified { left: 0.5rem !important; width: unset !important; right: ${SCROLLBAR_SIZE}px !important }
        .monaco-editor {
          outline-width: 0 !important;
          width: unset !important;
          right: ${SCROLLBAR_SIZE}px !important;
        }
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
      <DiffEditor
        height='100%'
        width='100%'
        theme='latitude'
        language='document'
        loading={<TextEditorPlaceholder />}
        original={oldValue}
        modified={newValue}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        options={options}
      />
    </EditorWrapper>
  )
}
