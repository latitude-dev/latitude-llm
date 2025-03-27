import { Suspense, useCallback } from 'react'
import { CompileError } from 'promptl-ai'
import { publishEventAction } from '$/actions/events/publishEventAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'

import { RefinementHook } from '../useRefinement'
import { DocumentSuggestions } from '../DocumentSuggestions'
import type { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'

function RefineButton({
  refinement,
  document,
  copilotEnabled,
}: {
  refinement: RefinementHook
  document: DocumentVersion
  copilotEnabled: boolean
}) {
  if (!copilotEnabled) return null

  const RefinementButton = (
    <Button
      disabled={document.promptlVersion === 0}
      className='bg-background'
      variant='outline'
      size='small'
      iconProps={{
        name: 'sparkles',
        size: 'small',
      }}
      onClick={refinement.modal.onOpen}
    >
      <Text.H6>Refine</Text.H6>
    </Button>
  )

  if (document.promptlVersion === 0) {
    return (
      <Tooltip trigger={RefinementButton} asChild>
        Upgrade the syntax of the document to use the Refine feature.
      </Tooltip>
    )
  }

  return <>{RefinementButton}</>
}

export function PlaygroundTextEditor({
  refinement,
  compileErrors,
  project,
  document,
  commit,
  onChange,
  setDiff,
  diff,
  value,
  copilotEnabled,
  isMerged,
  isSaved,
}: {
  refinement: RefinementHook
  compileErrors: CompileError[] | undefined
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  setDiff: ReactStateDispatch<DiffOptions | undefined>
  diff: DiffOptions | undefined
  copilotEnabled: boolean
  value: string
  isSaved: boolean
  isMerged: boolean
  onChange: (value: string) => void
}) {
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
    [executeRequestSuggestionAction],
  )

  return (
    <Suspense fallback={<TextEditorPlaceholder />}>
      <DocumentTextEditor
        value={value}
        compileErrors={compileErrors}
        onChange={onChange}
        diff={diff}
        readOnlyMessage={
          isMerged ? 'Create a draft to edit documents.' : undefined
        }
        isSaved={isSaved}
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
            <RefineButton
              refinement={refinement}
              document={document}
              copilotEnabled={copilotEnabled}
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
}
