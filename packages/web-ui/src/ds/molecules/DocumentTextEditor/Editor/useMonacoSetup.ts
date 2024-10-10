import { useCallback, useRef } from 'react'

import { Monaco } from '@monaco-editor/react'

import { colorFromProperty, themeRules, tokenizer } from './language'

export function useMonacoSetup() {
  const monacoRef = useRef<Monaco | null>(null)

  const handleEditorWillMount = useCallback((monaco: Monaco) => {
    if (monacoRef.current) return

    monaco.languages.register({ id: 'document' })
    monaco.languages.setMonarchTokensProvider('document', { tokenizer })
    monaco.languages.setLanguageConfiguration('document', {
      comments: {
        blockComment: ['/*', '*/'],
      },
    })
    monaco.editor.defineTheme('latitude', {
      base: 'vs',
      inherit: true,
      rules: themeRules,
      colors: {
        'editor.background': colorFromProperty('--secondary-rgb'),
        'editor.foreground': colorFromProperty('--foreground-rgb'),
      },
    })
  }, [])

  return { monacoRef, handleEditorWillMount }
}
