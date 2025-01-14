import { useCallback, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import { useMonacoSetup } from '../../../../DocumentTextEditor/Editor/useMonacoSetup'
import { TextEditorProps } from './types'

const LINE_HEIGHT = 18
const CONTAINER_GUTTER = 10
function useUpdateEditorHeight() {
  const prevLineCount = useRef(0)
  return useCallback((editor: editor.IStandaloneCodeEditor) => {
    const el = editor.getDomNode()
    if (!el) return
    const codeContainer = el.getElementsByClassName(
      'view-lines',
    )[0] as HTMLDivElement | null

    if (!codeContainer) return

    setTimeout(() => {
      const height =
        codeContainer.childElementCount > prevLineCount.current
          ? codeContainer.offsetHeight
          : codeContainer.childElementCount * LINE_HEIGHT + CONTAINER_GUTTER // fold
      prevLineCount.current = codeContainer.childElementCount

      el.style.height = height + 'px'

      editor.layout()
    }, 0)
  }, [])
}

export default function TextEditor({ value, onChange }: TextEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const { monacoRef, handleEditorWillMount } = useMonacoSetup()
  const [_, setIsEditorMounted] = useState(false)
  const updateHeight = useUpdateEditorHeight()
  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = editor

      editor.onDidChangeModelDecorations(() => {
        updateHeight(editor)
      })

      setIsEditorMounted(true)
    },
    [updateHeight, monacoRef],
  )
  return (
    <Editor
      theme='latitude'
      language='json'
      keepCurrentModel
      defaultValue={value}
      beforeMount={handleEditorWillMount}
      onMount={handleEditorDidMount}
      onChange={onChange}
      options={{
        language: 'json',
        readOnly: false,
        renderLineHighlight: 'none',
        minimap: { enabled: false },
        stickyScroll: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        folding: false,
      }}
    />
  )
}
