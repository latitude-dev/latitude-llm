import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { publishEventAction } from '$/actions/events/publishEventAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import type { AstError } from '@latitude-data/constants/promptl'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import type { IProjectContextType } from '$/app/providers/ProjectProvider'
import { memo, Suspense, useCallback } from 'react'
import { DocumentRefinement } from '../DocumentRefinement'
import { DocumentSuggestions } from '../DocumentSuggestions'
import { EditorSettings } from '../EditorSettings'
import { LatteDiffManager } from './LatteDiffManager'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'

export const PlaygroundTextEditor = memo(
  ({
    compileErrors,
    project,
    document,
    commit,
    onChange,
    value,
    defaultValue,
    copilotEnabled,
    refinementEnabled,
    isSaved,
    readOnlyMessage,
    highlightedCursorIndex,
  }: {
    compileErrors: AstError[] | undefined
    project: IProjectContextType['project']
    commit: ICommitContextType['commit']
    document: DocumentVersion
    copilotEnabled: boolean
    refinementEnabled: boolean
    value: string
    defaultValue?: string
    isSaved: boolean
    readOnlyMessage?: string
    onChange: (value: string) => void
    highlightedCursorIndex?: number
  }) => {
    const { execute: publishEvent } = useLatitudeAction(publishEventAction)
    const { diffOptions, setDiffOptions } = useDocumentValue()
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

        setDiffOptions({
          newValue: suggestion.code,
          description: suggestion.response,
          source: 'suggestion',
          onAccept: (newValue: string) => {
            setDiffOptions(undefined)
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
            setDiffOptions(undefined)
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
          diff={diffOptions}
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
                diff={diffOptions}
                setDiff={setDiffOptions}
                setPrompt={onChange}
              />
              <DocumentRefinement
                project={project}
                commit={commit}
                document={document}
                diff={diffOptions}
                setDiff={setDiffOptions}
                setPrompt={onChange}
                refinementEnabled={refinementEnabled}
              />
              <LatteDiffManager />
              <EditorSettings copilotEnabled={copilotEnabled} />
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
