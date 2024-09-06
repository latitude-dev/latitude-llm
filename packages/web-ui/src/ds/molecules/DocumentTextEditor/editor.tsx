'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react'

import { CompileError } from '@latitude-data/compiler'
import Editor, { Monaco } from '@monaco-editor/react'
import { MarkerSeverity, type editor } from 'monaco-editor'

import { DocumentTextEditorFallback, type DocumentTextEditorProps } from '.'
import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../lib/hooks/useLocalStorage'
import { Button, Icon, Text } from '../../atoms'
import { registerActions } from './actions'
import { colorFromProperty, themeRules, tokenizer } from './language'

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
  isSaved,
}: DocumentTextEditorProps) {
  const [defaultValue, _] = useState(value)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [isEditorMounted, setIsEditorMounted] = useState(false) // to avoid race conditions
  const [editorLines, setEditorLines] = useState(value.split('\n').length)
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

  const focusNextError = useCallback(() => {
    if (!editorRef.current) return
    const editor = editorRef.current
    editor.trigger('anystring', 'editor.action.marker.next', '')
  }, [])

  const handleEditorWillMount = useCallback((monaco: Monaco) => {
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
        'editor.background': colorFromProperty('--secondary'),
        'editor.foreground': colorFromProperty('--foreground'),
      },
    })
  }, [])

  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      setIsEditorMounted(true)

      registerActions(editor, monaco)
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
        endLineNumber: error.end ? error.end.line : (error.start?.line ?? 0),
        endColumn: error.end ? error.end.column : (error.start?.column ?? 0),
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
      setEditorLines(value?.split('\n').length ?? 0)
      onChange?.(value ?? '')
    },
    [onChange],
  )

  return (
    <div className='relative h-full rounded-lg border border-border overflow-hidden flex flex-col'>
      {!!readOnlyMessage && (
        <div className='flex flex-row w-full bg-secondary items-center justify-center px-2 gap-2 py-2'>
          <Icon name='lock' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>
            Version published. {readOnlyMessage}
          </Text.H6>
        </div>
      )}
      <div className='flex flex-grow relative'>
        <div className='absolute top-0 left-0 right-0 bottom-0'>
          <Editor
            height='100%'
            width='100%'
            theme='latitude'
            language='document'
            loading={<DocumentTextEditorFallback />}
            defaultValue={defaultValue}
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            onChange={handleValueChange}
            options={{
              fixedOverflowWidgets: true,
              lineDecorationsWidth: 0,
              padding: {
                top: readOnlyMessage ? 0 : 16,
                bottom: 16,
              },
              lineNumbers: showLineNumbers ? 'on' : 'off',
              minimap: {
                enabled: showMinimap,
              },
              copyWithSyntaxHighlighting: false,
              cursorSmoothCaretAnimation: 'on',
              occurrencesHighlight: 'off',
              renderLineHighlight: 'none',
              tabSize: 2,
              wordWrap: wrapText ? 'on' : 'off',
              readOnly: !!readOnlyMessage,
              readOnlyMessage: readOnlyMessage
                ? { value: readOnlyMessage, supportHtml: true }
                : undefined,
            }}
          />
        </div>
      </div>
      {!readOnlyMessage && (
        <div className='flex flex-row w-full items-center justify-between bg-muted'>
          <div className='flex flex-row items-center gap-2 px-2 py-1'>
            <Text.H6 color='foregroundMuted'>{editorLines} lines</Text.H6>
          </div>
          <div className='flex flex-row items-center gap-2 px-2'>
            {(metadata?.errors.length ?? 0) > 0 && (
              <Button
                variant='ghost'
                onClick={focusNextError}
                className='flex flex-row items-center gap-2'
              >
                <Text.H6 color='destructive'>
                  {metadata!.errors.length} errors
                </Text.H6>
                <AlertCircle className='h-4 w-4 text-destructive' />
              </Button>
            )}

            {isSaved !== undefined && (
              <div className='flex flex-row items-center gap-2'>
                {isSaved ? (
                  <>
                    <Text.H6 color='foregroundMuted'>Saved</Text.H6>
                    <CheckCircle2 className='h-4 w-4 text-muted-foreground' />
                  </>
                ) : (
                  <>
                    <Text.H6 color='foregroundMuted'>Saving...</Text.H6>
                    <LoaderCircle className='h-4 w-4 text-muted-foreground animate-spin' />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
