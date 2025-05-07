import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import { useMonacoSetup } from '../../../../DiffViewer/Editor/useMonacoSetup'
import { TextEditorProps } from './types'

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

export function updateMonacoPlaceholder({
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
      hasPlaceholder = updateMonacoPlaceholder({
        collection,
        decoration,
        editor,
        monaco,
        hasPlaceholder,
      })

      editor.onDidChangeModelContent(() => {
        if (!isMountedRef.current) return

        hasPlaceholder = updateMonacoPlaceholder({
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
    [updateHeight, isMountedRef, monacoRef, onCmdEnter],
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
  }, [onCmdEnter, monacoRef])
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
