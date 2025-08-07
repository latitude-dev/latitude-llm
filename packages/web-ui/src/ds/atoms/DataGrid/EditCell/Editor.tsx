import MonacoReactEditor, { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { DEFAULT_ROW_HEIGHT, EditorCellProps } from '..'
import { useCellPosition } from './useCellPosition'

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

type Props = EditorCellProps & {
  onHeightChange: (height: number) => void
}

function Editor({
  value: initialValue,
  valueType,
  onChange,
  onHeightChange,
}: Props) {
  const { height, updateHeight } = useUpdateEditorHeight({
    initialHeight: DEFAULT_ROW_HEIGHT,
    limitToInitialHeight: true,
    maxHeight: 400,
  })
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const isMountedRef = useRef(false)

  const language = valueType === 'json' ? 'json' : 'plaintext'
  const [value, setValue] = useState(initialValue)
  const onChangeEditorValue = useCallback(
    (newValue: string | undefined) => {
      const value = newValue ?? ''
      setValue(value)
      onChange({ value, commitChanges: false })
    },
    [onChange],
  )

  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor

      editor.layout()
      updateHeight(editor)

      editor.addCommand(monaco.KeyCode.Enter, () => {
        editor.trigger('keyboard', 'type', { text: '\n' })
      })

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onChangeEditorValue?.(editor.getValue())
      })

      isMountedRef.current = true
    },
    [isMountedRef, onChangeEditorValue, updateHeight],
  )

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (editor && isMountedRef.current) {
      updateHeight(editor)
    }
  }, [value, updateHeight])

  useEffect(() => {
    onHeightChange(height)
  }, [height, onHeightChange])

  return (
    <MonacoReactEditor
      theme='latitude'
      language={language}
      width='100%'
      height={height}
      keepCurrentModel
      onMount={handleEditorDidMount}
      value={value}
      onChange={onChangeEditorValue}
      options={{
        language,
        readOnly: false,
        renderLineHighlight: 'none',
        stickyScroll: { enabled: false },
        lineNumbers: 'off',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        folding: false,
        glyphMargin: false,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 0,
        minimap: { enabled: false },
        overviewRulerLanes: 0,
        lineHeight: 16,
        fontSize: 14,
        padding: {
          top: 8,
          bottom: 8,
        },
      }}
    />
  )
}

export function EditCell({ value, valueType, onChange }: EditorCellProps) {
  const { position, showCell, handleRef } = useCellPosition()
  const [height, setHeight] = useState(DEFAULT_ROW_HEIGHT)
  const onHeightChange = useCallback((newHeight: number) => {
    setHeight(newHeight)
  }, [])
  return (
    <div ref={handleRef} style={{ position: 'relative', height: '100%' }}>
      {showCell
        ? createPortal(
            <div
              className='absolute flex'
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                height: height,
                zIndex: 9999,
              }}
            >
              <Editor
                valueType={valueType}
                value={value}
                onChange={onChange}
                onHeightChange={onHeightChange}
              />
            </div>,
            position.container,
          )
        : null}
    </div>
  )
}
