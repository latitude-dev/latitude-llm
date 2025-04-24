'use client'

import { MutableRefObject, useCallback, useEffect, useState } from 'react'

import Editor, { Monaco } from '@monaco-editor/react'
import { MarkerSeverity, Range, Selection, type editor } from 'monaco-editor'

import { TextEditorPlaceholder } from '../../TextEditorPlaceholder'
import { DocumentError } from '../types'
import { registerActions } from './actions'
import { EditorWrapper } from './EditorWrapper'
import { useEditorOptions } from './useEditorOptions'
import { useMonacoSetup } from './useMonacoSetup'

function getEditorLine({ model }: { model: editor.ITextModel }): number {
  const lastLine = model.getLineCount()
  const lastLineText = model.getLineContent(lastLine)

  if (lastLineText.trim() !== '---') return lastLine

  model.pushEditOperations(
    [],
    [
      {
        range: new Range(lastLine + 1, 1, lastLine + 1, 1),
        text: '\n',
        forceMoveMarkers: true,
      },
    ],
    () => null,
  )
  return lastLine + 1
}

function moveFocusAtEnd(editor: editor.IStandaloneCodeEditor) {
  editor.focus()

  const model = editor.getModel()
  if (!model) return

  const lastLine = getEditorLine({ model })
  const lastColumn = model.getLineMaxColumn(lastLine)

  editor.setSelection(new Selection(lastLine, lastColumn, lastLine, lastColumn))
}

export function RegularMonacoEditor({
  className,
  editorRef,
  value,
  defaultValue,
  path,
  language = 'document',
  readOnlyMessage,
  errorMarkers,
  onChange,
  errorFixFn,
  autoFocus = false,
}: {
  className?: string
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>
  value: string
  defaultValue?: string
  path?: string
  readOnlyMessage?: string
  language?: string
  errorMarkers?: DocumentError[]
  onChange?: (value?: string) => void
  errorFixFn?: (errors: DocumentError[]) => void
  autoFocus?: boolean
}) {
  const { monacoRef, handleEditorWillMount } = useMonacoSetup({ errorFixFn })

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

      if (autoFocus) {
        moveFocusAtEnd(editor)
      }

      registerActions(editor, monaco)
      setIsEditorMounted(true)
    },
    [autoFocus, editorRef, monacoRef, setIsEditorMounted],
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
