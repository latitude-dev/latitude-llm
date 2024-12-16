import { editor } from 'monaco-editor'

import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../../lib/hooks/useLocalStorage'

export function useEditorOptions(
  overrides:
    | Partial<editor.IDiffEditorConstructionOptions>
    | Partial<editor.IStandaloneEditorConstructionOptions>,
) {
  const { value: showLineNumbers } = useLocalStorage({
    key: AppLocalStorage.editorLineNumbers,
    defaultValue: true,
  })
  const { value: wrapText } = useLocalStorage({
    key: AppLocalStorage.editorWrapText,
    defaultValue: true,
  })
  const { value: showMinimap } = useLocalStorage({
    key: AppLocalStorage.editorMinimap,
    defaultValue: false,
  })

  const options = {
    fixedOverflowWidgets: true,
    lineDecorationsWidth: 0,
    padding: {
      top: 16,
      bottom: 16,
    },
    lineNumbers: showLineNumbers ? 'on' : 'off',
    lineNumbersMinChars: 3,
    minimap: {
      enabled: showMinimap,
    },
    copyWithSyntaxHighlighting: false,
    cursorSmoothCaretAnimation: 'on',
    occurrencesHighlight: 'off',
    renderLineHighlight: 'none',
    wordWrap: wrapText ? 'on' : 'off',
    readOnly: true,
    readOnlyMessage: '',
    ...overrides,
  } as editor.IEditorOptions

  return { options }
}
