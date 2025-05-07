'use client'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { MarkerSeverity, type editor } from 'monaco-editor'
import { CompileError } from 'promptl-ai'

import {
  AppLocalStorage,
  useLocalStorage,
} from '../../../../lib/hooks/useLocalStorage'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../atoms/Button'
import { Icon } from '../../../atoms/Icons'
import { Text } from '../../../atoms/Text'
import { type DocumentError, type DocumentTextEditorProps } from '../types'
import { CopilotSection } from './CopilotSection'
import { MonacoDiffEditor } from './DiffEditor'
import { RegularMonacoEditor } from './RegularEditor'

const NO_ERRORS: CompileError[] = []
export function DocumentTextEditor({
  value,
  path,
  onChange,
  readOnlyMessage,
  isSaved,
  actionButtons,
  diff,
  copilot,
  compileErrors,
  autoFocus = false,
  autoCompleteParameters = [],
}: DocumentTextEditorProps) {
  const errors = compileErrors ?? NO_ERRORS
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null)

  const { value: showCopilotLocalStorage } = useLocalStorage({
    key: AppLocalStorage.editorCopilot,
    defaultValue: true,
  })
  const showCopilot = showCopilotLocalStorage && copilot

  const [editorLines, setEditorLines] = useState(value.split('\n').length)

  const focusNextError = useCallback(() => {
    if (!editorRef.current) return
    const editor = editorRef.current
    editor.trigger('anystring', 'editor.action.marker.next', '')
  }, [])

  const errorMarkers = useMemo<DocumentError[]>(
    () =>
      errors.map((error: CompileError) => {
        return {
          startLineNumber: error.start?.line ?? 0,
          startColumn: error.start?.column ?? 0,
          endLineNumber: error.end ? error.end.line : (error.start?.line ?? 0),
          endColumn: error.end ? error.end.column : (error.start?.column ?? 0),
          message: error.message,
          severity: MarkerSeverity.Error,
        }
      }) ?? [],
    [errors],
  )

  const handleValueChange = useCallback(
    (value: string | undefined) => {
      setEditorLines(value?.split('\n').length ?? 0)
      onChange?.(value ?? '')
    },
    [onChange],
  )

  const [isApplyingDiff, setIsApplyingDiff] = useState(false)
  const [isDiscardingDiff, setIsDiscardingDiff] = useState(false)

  const handleAcceptDiff = useCallback(async () => {
    if (!diff) return
    if (!diffEditorRef.current) return

    const newValue = diffEditorRef.current.getModifiedEditor().getValue()

    setIsApplyingDiff(true)
    diff.onAccept(newValue)
    setIsApplyingDiff(false)
  }, [diff])

  const handleRejectDiff = useCallback(async () => {
    if (!diff) return
    if (!diffEditorRef.current) return

    setIsDiscardingDiff(true)
    diff.onReject()
    setIsDiscardingDiff(false)
  }, [diff])

  const errorFixFn = useMemo(() => {
    if (!copilot) return undefined

    return (errors: DocumentError[]) => {
      const request =
        'Please, fix the following errors from the prompt:\n' +
        errors.map((error) => ` - ${JSON.stringify(error)}`).join('\n')

      return copilot.requestSuggestion(request)
    }
  }, [copilot])

  return (
    <div className='relative h-full rounded-lg border border-border overflow-hidden flex flex-col bg-secondary'>
      {!!readOnlyMessage && (
        <div className='flex flex-row w-full items-center justify-center px-2 gap-2 py-2'>
          <Icon name='lock' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>
            Version published. {readOnlyMessage}
          </Text.H6>
        </div>
      )}
      {diff ? (
        <MonacoDiffEditor
          editorRef={diffEditorRef}
          oldValue={value}
          newValue={diff.newValue}
        />
      ) : (
        <RegularMonacoEditor
          autoFocus={autoFocus}
          editorRef={editorRef}
          value={value}
          path={path}
          readOnlyMessage={
            readOnlyMessage ||
            (copilot?.isLoading ? 'Copilot is thinking...' : undefined)
          }
          className={cn('w-full h-full flex', {
            'animate-pulse': copilot?.isLoading,
          })}
          onChange={handleValueChange}
          errorMarkers={errorMarkers}
          errorFixFn={errorFixFn}
          autoCompleteParameters={autoCompleteParameters}
        />
      )}
      {diff && (
        <div className='flex w-full px-2'>
          <div className='flex flex-col w-full items-center gap-2 bg-background border border-border rounded-md p-2'>
            {diff.description && (
              <div className='w-full max-h-24 overflow-y-auto custom-scrollbar px-2'>
                <Text.H5 color='foregroundMuted'>{diff.description}</Text.H5>
              </div>
            )}
            <div className='flex flex-row gap-2 w-full justify-end'>
              <Button
                variant='outline'
                fancy
                onClick={handleRejectDiff}
                disabled={isDiscardingDiff || isApplyingDiff}
              >
                {isDiscardingDiff ? 'Discarding...' : 'Discard'}
              </Button>
              <Button
                fancy
                onClick={handleAcceptDiff}
                disabled={isApplyingDiff || isDiscardingDiff}
              >
                {isApplyingDiff ? 'Applying...' : 'Apply'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showCopilot && !readOnlyMessage && !diff && copilot && (
        <CopilotSection
          isLoading={copilot.isLoading}
          requestSuggestion={copilot.requestSuggestion}
          disabledMessage={copilot.disabledMessage}
        />
      )}
      <div className='flex flex-row w-full p-2 items-center justify-between gap-2'>
        <div className='flex flex-row items-center gap-2'>
          <div className='flex flex-row items-center gap-2 px-2 py-1 bg-background border border-border rounded-md'>
            <Text.H6 color='foregroundMuted'>{editorLines} lines</Text.H6>
          </div>
          {!diff && !readOnlyMessage && isSaved !== undefined && (
            <div className='flex flex-row items-center gap-2 px-2 py-1 bg-background border border-border rounded-md'>
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
          {!diff && (errors.length ?? 0) > 0 && (
            <Button
              variant='outline'
              onClick={focusNextError}
              size='small'
              iconProps={{
                name: 'alertCircle',
                placement: 'right',
                size: 'normal',
                color: 'destructive',
              }}
              className='group-hover:border-destructive'
            >
              <Text.H6 color='destructive'>{errors.length} errors</Text.H6>
            </Button>
          )}
        </div>
        <div className='flex flex-row items-center gap-2'>{actionButtons}</div>
      </div>
    </div>
  )
}
