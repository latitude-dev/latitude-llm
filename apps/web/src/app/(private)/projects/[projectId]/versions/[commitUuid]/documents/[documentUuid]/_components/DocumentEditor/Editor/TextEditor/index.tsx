import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { publishEventAction } from '$/actions/events/publishEventAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { DocumentVersion } from '@latitude-data/core/browser'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import type { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import type { AstError } from '@latitude-data/constants/simpleBlocks'
import { memo, Suspense, useCallback } from 'react'
import { DocumentRefinement } from '../DocumentRefinement'
import { DocumentSuggestions } from '../DocumentSuggestions'

export const PlaygroundTextEditor = memo(
  ({
    compileErrors,
    project,
    document,
    commit,
    onChange,
    setDiff,
    diff,
    value,
    defaultValue,
    copilotEnabled,
    isSaved,
    readOnlyMessage,
    highlightedCursorIndex,
  }: {
    compileErrors: AstError[] | undefined
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    setDiff: ReactStateDispatch<DiffOptions | undefined>
    diff: DiffOptions | undefined
    copilotEnabled: boolean
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onChange: (value: string) => void
    highlightedCursorIndex?: number
  }) => {
    const { execute: publishEvent } = useLatitudeAction(publishEventAction)
    const {
      execute: executeRequestSuggestionAction,
      isPending: isCopilotLoading,
    } = useLatitudeAction(requestSuggestionAction, {
      onSuccess: ({
        data: suggestion,
      }: {
        data: { code: string; response: string } | null
      }) => {
        if (!suggestion) return

        setDiff({
          newValue: suggestion.code,
          description: suggestion.response,
          onAccept: (newValue: string) => {
            setDiff(undefined)
            publishEvent({
              eventType: 'copilotSuggestionApplied',
              payload: {
                projectId: project.id,
                commitUuid: commit.uuid,
                documentUuid: document.documentUuid,
              },
            })
            onChange(newValue)
          },
          onReject: () => {
            setDiff(undefined)
          },
        })
      },
    })
    const requestSuggestion = useCallback(
      (prompt: string) => {
        executeRequestSuggestionAction({
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          request: prompt,
        })
      },
      [
        executeRequestSuggestionAction,
        commit.uuid,
        project.id,
        document.documentUuid,
      ],
    )

    return (
      <Suspense fallback={<TextEditorPlaceholder />}>
        <DocumentTextEditor
          autoFocus
          value={value}
          defaultValue={defaultValue}
          compileErrors={compileErrors}
          onChange={onChange}
          diff={diff}
          readOnlyMessage={readOnlyMessage}
          isSaved={isSaved}
          highlightedCursorIndex={highlightedCursorIndex}
          actionButtons={
            <>
              <DocumentSuggestions
                project={project}
                commit={commit}
                document={document}
                prompt={value}
                setDiff={setDiff}
                setPrompt={onChange}
              />
              <DocumentRefinement
                project={project}
                commit={commit}
                document={document}
                setDiff={setDiff}
                setPrompt={onChange}
                refinementEnabled={copilotEnabled}
              />
            </>
          }
          copilot={
            copilotEnabled
              ? {
                  isLoading: isCopilotLoading,
                  requestSuggestion,
                  disabledMessage:
                    document.promptlVersion === 0
                      ? 'Copilot is disabled for prompts using the old syntax. Upgrade to use Copilot.'
                      : undefined,
                }
              : undefined
          }
        />
      </Suspense>
    )
  },
)
