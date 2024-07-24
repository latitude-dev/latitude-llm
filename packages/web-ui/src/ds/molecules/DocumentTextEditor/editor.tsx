'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CompileError } from '@latitude-data/compiler'
import Editor, { Monaco } from '@monaco-editor/react'
import { MarkerSeverity, type editor } from 'monaco-editor'

import type { DocumentTextEditorProps } from '.'
import { themeRules, tokenizer } from './language'

export type DocumentError = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
}

export function DocumentTextEditor({
  value,
  metadata,
  onChange,
  readOnlyMessage,
}: DocumentTextEditorProps) {
  const [defaultValue, _] = useState(value)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [isEditorMounted, setIsEditorMounted] = useState(false) // to avoid race conditions

  const handleEditorWillMount = useCallback((monaco: Monaco) => {
    const style = getComputedStyle(document.body)

    monaco.languages.register({ id: 'document' })
    monaco.languages.setMonarchTokensProvider('document', { tokenizer })
    monaco.editor.defineTheme('latitude', {
      base: 'vs',
      inherit: true,
      rules: themeRules,
      colors: {
        'editor.background': style.getPropertyValue('--secondary'),
      },
    })
  }, [])

  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      setIsEditorMounted(true)
    },
    [],
  )

  const updateMarkers = useCallback(() => {
    if (!metadata) return
    if (!monacoRef.current) return
    if (!editorRef.current) return

    const model = editorRef.current.getModel()
    if (!model) return

    const markers = metadata.errors.map((error: CompileError) => {
      return {
        startLineNumber: error.start?.line ?? 0,
        startColumn: error.start?.column ?? 0,
        endLineNumber: error.end ? error.end.line : error.start?.line ?? 0,
        endColumn: error.end ? error.end.column : error.start?.column ?? 0,
        message: error.message,
        severity: MarkerSeverity.Error,
      }
    })
    monacoRef.current.editor.setModelMarkers(model, '', markers)
  }, [metadata?.errors])

  useEffect(() => {
    if (!isEditorMounted) return
    if (!metadata) return
    updateMarkers()
  }, [metadata, isEditorMounted])

  const handleValueChange = useCallback(
    (value: string | undefined) => {
      onChange?.(value ?? '')
    },
    [onChange],
  )

  return (
    <div className='relative h-full rounded-lg border border-border overflow-hidden'>
      <div className='absolute top-0 left-0 right-0 bottom-0'>
        <Editor
          height='100%'
          width='100%'
          theme='latitude'
          language='document'
          defaultValue={defaultValue}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          onChange={handleValueChange}
          options={{
            fixedOverflowWidgets: true,
            lineDecorationsWidth: 0,
            padding: {
              top: 16,
              bottom: 16,
            },
            lineNumbers: 'off',
            minimap: {
              enabled: false,
            },
            copyWithSyntaxHighlighting: false,
            cursorSmoothCaretAnimation: 'on',
            occurrencesHighlight: 'off',
            renderLineHighlight: 'none',
            tabSize: 2,
            wordWrap: 'on',
            readOnly: !!readOnlyMessage,
            readOnlyMessage: readOnlyMessage
              ? { value: readOnlyMessage, supportHtml: true }
              : undefined,
          }}
        />
      </div>
    </div>
  )
}
