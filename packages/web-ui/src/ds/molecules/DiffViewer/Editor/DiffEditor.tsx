'use client'

import { MutableRefObject, useCallback } from 'react'

import { DiffEditor, Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'

import { TextEditorPlaceholder } from '../../TextEditorPlaceholder'
import { EditorWrapper } from './EditorWrapper'
import { useEditorOptions } from './useEditorOptions'
import { useMonacoSetup } from './useMonacoSetup'

export function MonacoDiffEditor({
  editorRef,
  oldValue,
  newValue,
}: {
  editorRef: MutableRefObject<editor.IStandaloneDiffEditor | null>
  oldValue: string
  newValue: string
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
    [],
  )

  return (
    <EditorWrapper>
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
