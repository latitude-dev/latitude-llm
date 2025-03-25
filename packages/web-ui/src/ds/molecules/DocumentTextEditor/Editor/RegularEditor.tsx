'use client'

import { MutableRefObject, useCallback, useEffect, useState } from 'react'

import Editor, { Monaco } from '@monaco-editor/react'
import { MarkerSeverity, type editor } from 'monaco-editor'

import { TextEditorPlaceholder } from '../../TextEditorPlaceholder'
import type { DocumentError } from '../types'
import { registerActions } from './actions'
import { EditorWrapper } from './EditorWrapper'
import { useEditorOptions } from './useEditorOptions'
import { useMonacoSetup } from './useMonacoSetup'

export function RegularMonacoEditor({
  className,
  editorRef,
  value,
  path,
  language = 'document',
  readOnlyMessage,
  errorMarkers,
  onChange,
  errorFixFn,
}: {
  className?: string
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  value: string
  path?: string
  readOnlyMessage?: string
  language?: string
  errorMarkers?: DocumentError[]
  onChange?: (value?: string) => void
  errorFixFn?: (errors: DocumentError[]) => void
}) {
  const { monacoRef, handleEditorWillMount } = useMonacoSetup({ errorFixFn })

  const [defaultValue, _] = useState(value)
  // to avoid race conditions
  const [isEditorMounted, setIsEditorMounted] = useState(false)
  const { options } = useEditorOptions({
    tabSize: 2,
    readOnly: !!readOnlyMessage,
    readOnlyMessage: readOnlyMessage
      ? { value: readOnlyMessage, supportHtml: true }
      : undefined,
  })

  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      monacoRef.current = monaco
      editorRef.current = editor

      registerActions(editor, monaco)

      setIsEditorMounted(true)
    },
    [],
  )

  useEffect(() => {
    if (!monacoRef.current) return
    if (!editorRef.current) return
    if (!isEditorMounted) return

    const model = editorRef.current.getModel()
    if (!model) return

    const modelMarkers = (errorMarkers ?? []).map((error) => {
      return {
        ...error,
        severity: MarkerSeverity.Error,
      }
    })

    monacoRef.current.editor.setModelMarkers(model, '', modelMarkers)
  }, [errorMarkers, isEditorMounted])

  return (
    <EditorWrapper className={className}>
      <Editor
        height='100%'
        width='100%'
        theme='latitude'
        language={language}
        keepCurrentModel={!!path}
        path={path}
        loading={<TextEditorPlaceholder />}
        defaultValue={defaultValue}
        value={value}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        onChange={onChange}
        options={options}
      />
    </EditorWrapper>
  )
}
