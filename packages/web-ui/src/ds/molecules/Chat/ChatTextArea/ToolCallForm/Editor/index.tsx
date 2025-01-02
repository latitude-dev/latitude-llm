import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import { useMonacoSetup } from '../../../../DocumentTextEditor/Editor/useMonacoSetup'
import { TextEditorProps } from './types'

const LINE_HEIGHT = 18
const CONTAINER_GUTTER = 10
function useUpdateEditorHeight({ initialHeight }: { initialHeight: number }) {
  const [heightState, setHeight] = useState(initialHeight)
  const prevLineCount = useRef(0)
  const updateHeight = useCallback((editor: editor.IStandaloneCodeEditor) => {
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

      // Max height
      if (height >= 200) return

      setHeight(height)
      el.style.height = height + 'px'

      editor.layout()
    }, 0)
  }, [])
  return { height: heightState, updateHeight }
}

function updatePlaceholder({
  collection,
  decoration,
  editor,
  hasPlaceholder,
}: {
  collection: editor.IEditorDecorationsCollection
  decoration: editor.IModelDeltaDecoration
  editor: editor.IStandaloneCodeEditor
  monaco: Monaco
  hasPlaceholder: boolean
}) {
  const model = editor.getModel()
  if (!model) return false

  const modelValue = model.getValue()

  if ((modelValue === '' || modelValue === ' ') && !hasPlaceholder) {
    collection.append([decoration])
    return true
  } else if (hasPlaceholder) {
    collection.clear()
    return false
  }

  return false
}

export default function TextEditor({
  value,
  onChange,
  onCmdEnter,
  placeholder,
}: TextEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const { monacoRef, handleEditorWillMount } = useMonacoSetup()
  const isMountedRef = useRef(false)
  const { height, updateHeight } = useUpdateEditorHeight({ initialHeight: 0 })
  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = editor
      let hasPlaceholder = false
      const collection = editor.createDecorationsCollection([])
      const decoration = {
        range: new monaco.Range(1, 1, 1, 1),
        options: {
          isWholeLine: true,
          className: 'hack-monaco-editor-placeholder',
        },
      }
      editor.focus()

      // Initial placeholder setup
      hasPlaceholder = updatePlaceholder({
        collection,
        decoration,
        editor,
        monaco,
        hasPlaceholder,
      })

      editor.onDidChangeModelContent(() => {
        if (!isMountedRef.current) return

        hasPlaceholder = updatePlaceholder({
          collection,
          decoration,
          editor,
          monaco,
          hasPlaceholder,
        })
      })

      editor.onDidChangeModelDecorations(() => {
        updateHeight(editor)
      })

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onCmdEnter?.(editor.getValue())
      })

      isMountedRef.current = true
    },
    [updateHeight, isMountedRef, monacoRef, placeholder, onCmdEnter, onChange],
  )

  // Refresh onCmdEnter prop callback when it changes
  useEffect(() => {
    if (!editorRef.current) return
    if (!isMountedRef.current) return
    if (!monacoRef.current) return

    const monaco = monacoRef.current
    const editor = editorRef.current
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onCmdEnter?.(editor.getValue())
    })
  }, [onCmdEnter])
  return (
    <>
      <Editor
        theme='latitude'
        language='json'
        width='100%'
        height={height}
        keepCurrentModel
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
        }}
      />
      <style>
        {`
          .hack-monaco-editor-placeholder::before {
            content: '${placeholder}';
            color: hsl(var(--muted-foreground) / 1);
            font-size: 12px;
            line-height: 16px;
          }
      `}
      </style>
    </>
  )
}
