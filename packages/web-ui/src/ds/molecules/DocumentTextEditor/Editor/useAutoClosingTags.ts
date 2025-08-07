import { Monaco } from '@monaco-editor/react'
import { editor, IDisposable } from 'monaco-editor'
import { useCallback, useEffect, useRef } from 'react'
import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../../lib/hooks/useLocalStorage'

const createAutoClosingTagsHandler = (
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
): IDisposable => {
  return editor.onKeyDown((event) => {
    if (event.browserEvent.key !== '>') return

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection) return

    const contentBeforeChange = model.getValueInRange({
      startLineNumber: selection.selectionStartLineNumber,
      startColumn: 1,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    })

    const match = contentBeforeChange.match(/<([\w-]+)([^>/]*)$/)
    if (!match) return

    event.preventDefault()
    event.stopPropagation()

    const [, tag] = match

    const edit = {
      range: selection,
      text: `></${tag}>`,
      forceMoveMarkers: true,
    }

    // position where we want the cursor to be after the closing tag is inserted
    const nextCursorPosition = new monaco.Selection(
      selection.selectionStartLineNumber,
      selection.selectionStartColumn + 1,
      selection.endLineNumber,
      selection.endColumn + 1,
    )

    editor.executeEdits('auto-close-tag', [edit], [nextCursorPosition])
  })
}

export function useAutoClosingTags() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const disposableRef = useRef<IDisposable | null>(null)

  const { value: enabled } = useLocalStorage({
    key: AppLocalStorage.editorAutoClosingTags,
    defaultValue: true,
  })

  const reconfigure = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    disposableRef.current?.dispose()
    if (enabled) {
      disposableRef.current = createAutoClosingTagsHandler(editor, monaco)
    }
  }, [enabled])

  const registerAutoClosingTags = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      reconfigure()
    },
    [reconfigure],
  )

  useEffect(() => {
    reconfigure()
    return () => disposableRef.current?.dispose()
  }, [enabled, reconfigure])

  return { registerAutoClosingTags }
}
