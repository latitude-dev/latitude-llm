import { useCallback, useRef } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import { useMonacoSetup } from '@latitude-data/web-ui/hooks/useMonacoSetup'
import { useUpdateEditorHeight } from '@latitude-data/web-ui/atoms/DataGrid'

type TextEditorProps = {
  value?: string
  onChange: (value: string | undefined) => void
  initialHeight?: number
}

export default function TextEditor({
  initialHeight,
  value,
  onChange,
}: TextEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const { monacoRef, handleEditorWillMount } = useMonacoSetup()
  const isMountedRef = useRef(false)
  const { height, updateHeight } = useUpdateEditorHeight({
    initialHeight: initialHeight ?? 0,
    maxHeight: 800,
  })
  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = editor
      editor.focus()

      editor.onDidChangeModelDecorations(() => {
        updateHeight(editor)
      })

      setTimeout(() => {
        editor.getAction('editor.action.formatDocument')?.run()
      }, 0)

      isMountedRef.current = true
    },
    [updateHeight, isMountedRef, monacoRef],
  )

  return (
    <>
      <Editor
        theme='latitude'
        language='json'
        width='100%'
        height={height}
        keepCurrentModel
        className='history-params-editor'
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        value={value}
        onChange={onChange}
        options={{
          language: 'json',
          readOnly: false,
          renderLineHighlight: 'none',
          stickyScroll: { enabled: false },
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          minimap: { enabled: false },
          overviewRulerLanes: 0,
          padding: { top: 16, bottom: 16 },
        }}
      />
      <style>
        {`
          .history-params-editor .monaco-editor {
            outline-style: none;
            padding-left: 16px;
            padding-right: 16px;
          }
      `}
      </style>
    </>
  )
}
