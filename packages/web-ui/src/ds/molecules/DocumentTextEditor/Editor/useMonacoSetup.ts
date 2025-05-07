import { useCallback, useEffect, useRef } from 'react'

import { type Monaco } from '@monaco-editor/react'
import { type languages } from 'monaco-editor'

import { DocumentError } from '../types'
import {
  themeRules,
  tokenizer,
  useThemeColors,
} from '../../../../lib/monacoEditor/language'

export function useMonacoSetup({
  errorFixFn,
}: {
  errorFixFn?: (errors: DocumentError[]) => void
} = {}) {
  const monacoRef = useRef<Monaco | null>(null)
  const themeColors = useThemeColors()

  const applyTheme = useCallback(
    (monaco: Monaco) => {
      monaco.editor.defineTheme('latitude', {
        base: 'vs',
        inherit: true,
        rules: themeRules(themeColors),
        colors: {
          'editor.background': themeColors.secondary,
          'editor.foreground': themeColors.foreground,
          'editorLineNumber.activeForeground': themeColors.foreground,
          'editorCursor.foreground': themeColors.foreground,
        },
      })

      monaco.editor.setTheme('latitude')
    },
    [themeColors],
  )

  useEffect(() => {
    if (!monacoRef.current) return

    applyTheme(monacoRef.current)
  }, [applyTheme])

  const handleEditorWillMount = useCallback((monaco: Monaco) => {
    if (monacoRef.current) return

    monaco.languages.register({ id: 'document' })
    monaco.languages.setMonarchTokensProvider('document', { tokenizer })
    monaco.languages.setLanguageConfiguration('document', {
      comments: {
        blockComment: ['/*', '*/'],
      },
      autoClosingPairs: [{ open: '{{ ', close: ' }}' }],
    })
    applyTheme(monaco)

    monaco.editor.addCommand({
      id: 'fixErrors',
      run: (_, ...errors: DocumentError[]) => errorFixFn?.(errors),
    })

    if (errorFixFn) {
      const codeActionProvider: languages.CodeActionProvider = {
        provideCodeActions: (_, __, context, ___) => {
          const actions = [
            {
              title: 'Fix with copilot',
              diagnostics: context.markers,
              kind: 'quickfix',
              isPreferred: true,
              edit: {
                edits: [],
              },
              command: {
                id: 'fixErrors',
                title: 'Fix with copilot',
                arguments: context.markers.map((marker) => ({
                  message: marker.message,
                  startLineNumber: marker.startLineNumber,
                  startColumn: marker.startColumn,
                })),
              },
            },
          ]

          return {
            actions,
            dispose: () => {},
          }
        },
      }

      const disposable = monaco.languages.registerCodeActionProvider(
        'document',
        codeActionProvider,
      )

      return () => {
        disposable.dispose()
      }
    }
  }, [])

  return { monacoRef, handleEditorWillMount }
}
