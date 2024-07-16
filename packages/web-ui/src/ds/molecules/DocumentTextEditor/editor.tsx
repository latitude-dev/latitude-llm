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
  disabled,
}: DocumentTextEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [isEditorMounted, setIsEditorMounted] = useState(false) // to avoid race conditions

  function handleEditorWillMount(monaco: Monaco) {
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
  }

  function handleEditorDidMount(
    editor: editor.IStandaloneCodeEditor,
    monaco: Monaco,
  ) {
    editorRef.current = editor
    monacoRef.current = monaco
    setIsEditorMounted(true)
  }

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

  function handleValueChange(value: string | undefined) {
    if (value) onChange?.(value)
  }

  return (
    <div className='flex flex-col relative h-full w-full rounded-lg border border-border overflow-hidden'>
      <Editor
        height='100%'
        width='100%'
        theme='latitude'
        language='document'
        defaultValue={value}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        onChange={handleValueChange}
        options={{
          lineNumbers: 'off',
          readOnly: disabled,
          readOnlyMessage: {
            value: 'Create a new draft to edit this document',
          },
          minimap: {
            enabled: false,
          },
        }}
      />
    </div>
  )
}
