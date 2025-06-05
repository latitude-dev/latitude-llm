import { MutableRefObject, useEffect, useState } from 'react'

import { type Monaco } from '@monaco-editor/react'
import { editor } from 'monaco-editor'

export function useHighlightedCursor({
  monacoRef,
  editorRef,
  isEditorMounted,
  value,
  highlightedCursorIndex,
}: {
  monacoRef: MutableRefObject<Monaco | null>
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  isEditorMounted: boolean
  value: string
  highlightedCursorIndex?: number
}) {
  const [decorationIds, setDecorationIds] = useState<string[]>([])

  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return
    if (!isEditorMounted) return
    const editor = editorRef.current
    const monaco = monacoRef.current

    if (highlightedCursorIndex == undefined) {
      if (decorationIds.length) {
        const ids = editor?.deltaDecorations(decorationIds, [])
        setDecorationIds(ids || [])
      }
      return
    }

    const model = editor.getModel()
    if (!model) return

    const idx = Math.max(0, Math.min(highlightedCursorIndex, value.length))

    const before = value.slice(0, idx)
    const lines = before.split('\n')
    const lineNumber = lines.length
    const column = lines[lines.length - 1]!.length + 1

    const newDecorations: editor.IModelDeltaDecoration[] = [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'myLineHighlight',
        },
      },
      {
        range: new monaco.Range(lineNumber, column, lineNumber, column),
        options: {
          beforeContentClassName: 'myCursorDecoration',
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]

    const newIds = editor.deltaDecorations(decorationIds, newDecorations)
    setDecorationIds(newIds)

    editor.revealPositionInCenter({ lineNumber, column })
  }, [
    highlightedCursorIndex,
    value,
    isEditorMounted,
    decorationIds,
    monacoRef,
    editorRef,
  ])
}
