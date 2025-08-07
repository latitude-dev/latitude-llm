import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

export function registerActions(editor: editor.IStandaloneCodeEditor, monaco: Monaco) {
  editor.addAction({
    id: 'toggleBlockComment',
    label: 'Toggle comment',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    run: () => {
      const selection = editor.getSelection()
      if (!selection) return

      const model = editor.getModel()
      if (!model) return

      const startLineNumber = selection.startLineNumber
      const endLineNumber = selection.endLineNumber
      const startColumn = selection.startColumn
      const endColumn = selection.endColumn

      if (startLineNumber === endLineNumber && startColumn === endColumn) {
        // Single line, no selection
        const lineContent = model.getLineContent(startLineNumber)
        const startComment = '/* '
        const endComment = ' */'

        if (
          lineContent.trim().startsWith(startComment) &&
          lineContent.trim().endsWith(endComment)
        ) {
          // Uncomment the line
          const uncommentedLine = lineContent.trim().slice(startComment.length, -endComment.length)
          model.pushEditOperations(
            [],
            [
              {
                range: new monaco.Range(
                  startLineNumber,
                  1,
                  startLineNumber,
                  lineContent.length + 1,
                ),
                text: uncommentedLine.trim(),
              },
            ],
            () => null,
          )
        } else {
          // Comment the line
          const commentedLine = `${startComment}${lineContent}${endComment}`
          model.pushEditOperations(
            [],
            [
              {
                range: new monaco.Range(
                  startLineNumber,
                  1,
                  startLineNumber,
                  lineContent.length + 1,
                ),
                text: commentedLine,
              },
            ],
            () => null,
          )
        }
      } else {
        // Multiple lines or selection
        const selectedText = model.getValueInRange(selection)
        const startComment = '/* '
        const endComment = ' */'

        if (selectedText.startsWith(startComment) && selectedText.endsWith(endComment)) {
          // Uncomment the selection
          const uncommented = selectedText.slice(startComment.length, -endComment.length)
          model.pushEditOperations(
            [],
            [
              {
                range: selection,
                text: uncommented,
              },
            ],
            () => null,
          )
        } else {
          // Comment the selection
          const commented = `${startComment}${selectedText}${endComment}`
          model.pushEditOperations(
            [],
            [
              {
                range: selection,
                text: commented,
              },
            ],
            () => null,
          )
        }
      }
    },
  })
}
