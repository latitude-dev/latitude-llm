import type { Monaco } from '@monaco-editor/react'

export function registerAutocompleteParameters({
  monaco,
  language,
  autoCompleteParameters,
}: {
  monaco: Monaco
  language: string
  autoCompleteParameters: string[]
}) {
  if (!autoCompleteParameters.length) return

  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ['{'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const match = textUntilPosition.match(/\{\{\s*([a-zA-Z0-9_]*)$/)
      if (!match) return { suggestions: [] }

      const currentWord = match?.[1]

      if (!currentWord) return { suggestions: [] }

      const suggestions = autoCompleteParameters
        .filter((word) => word.startsWith(currentWord))
        .map((word) => ({
          label: word,
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: word,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column - currentWord.length,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }))

      return { suggestions }
    },
  })
}
