import { useCallback, useEffect, useRef } from 'react'

import { loader, type Monaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import {
  themeRules,
  tokenizer,
  useThemeColors,
} from '../../../../lib/monacoEditor/language'

loader.config({ monaco })

export function useMonacoSetup() {
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
    })
    applyTheme(monaco)
  }, [])

  return { monacoRef, handleEditorWillMount }
}
