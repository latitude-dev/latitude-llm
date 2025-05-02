import { useCallback, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import { useMonacoSetup } from '@latitude-data/web-ui/hooks/useMonacoSetup'

export function useUpdateEditorHeight({
  initialHeight,
  maxHeight = 200,
  limitToInitialHeight = false,
}: {
  initialHeight: number
  maxHeight?: number
  limitToInitialHeight?: boolean
}) {
  const [heightState, setHeight] = useState(initialHeight)
  const updateHeight = useCallback(
    (editor: editor.IStandaloneCodeEditor) => {
      const el = editor.getDomNode()
      if (!el) return

      requestAnimationFrame(() => {
        let height = editor.getContentHeight()

        // Max height
        if (height >= maxHeight) {
          height = maxHeight
        }

        if (limitToInitialHeight) {
          height = height < initialHeight ? initialHeight : height
        }

        setHeight(height)
        el.style.height = height + 'px'

        editor.layout()
      })
    },
    [initialHeight, limitToInitialHeight, maxHeight],
  )
  return { height: heightState, updateHeight }
}

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
