import { Monaco } from '@monaco-editor/react'
import { type editor } from 'monaco-editor'

function addAutoCloseTagFeature(
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
) {
  editor.onKeyDown((event) => {
    if (event.browserEvent.key !== '>') return

    const model = editor.getModel()
    if (!model) return

    const selection = editor.getSelection()
    if (!selection) return

    // position where we want the cursor to be after the closing tag is inserted
    const nextCursorPosition = new monaco.Selection(
      selection.selectionStartLineNumber,
      selection.selectionStartColumn + 1,
      selection.endLineNumber,
      selection.endColumn + 1,
    )

    const contentBeforeChange = model.getValueInRange({
      startLineNumber: selection.selectionStartLineNumber,
      startColumn: 1,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    })

    const match = contentBeforeChange.match(/<([\w-]+)([^>/]*)$/)
    if (!match) return

    const [_, tag] = match

    const edit = {
      range: nextCursorPosition,
      text: `</${tag}>`,
      forceMoveMarkers: true,
    }

    // wait for next tick to avoid adding the closing tag before the '>' key is inserted
    setTimeout(() => {
      editor.executeEdits('auto-close-tag', [edit], [nextCursorPosition])
    }, 0)
  })
}

export function registerFeatures(
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco,
) {
  addAutoCloseTagFeature(editor, monaco)
}
