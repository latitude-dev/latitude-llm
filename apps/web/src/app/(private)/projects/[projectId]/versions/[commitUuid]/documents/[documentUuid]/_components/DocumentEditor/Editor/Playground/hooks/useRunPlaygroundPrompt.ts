import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'
import {
  Message as ConversationMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { TraceContext } from '@latitude-data/constants'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { useCallback, useMemo } from 'react'

export function useRunPlaygroundPrompt({
  commit,
  projectId,
  document,
  parameters,
  userMessage,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  projectId: number
  parameters: Record<string, unknown> | undefined
  userMessage?: string
}) {
  const {
    createStreamHandler,
    abortCurrentStream,
    hasActiveStream,
    createAbortController,
  } = useStreamHandler()
  const runPromptFn = useCallback(async () => {
    const signal = createAbortController()

    const response = await fetch(
      ROUTES.api.documents.detail(document.documentUuid).run,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: document.path,
          projectId: projectId,
          commitUuid: commit.uuid,
          parameters: parameters ?? {},
          stream: true, // Explicitly request streaming
          userMessage,
        }),
        signal: signal,
      },
    )

    return createStreamHandler(response, signal)
  }, [
    projectId,
    document.path,
    document.documentUuid,
    commit.uuid,
    parameters,
    userMessage,
    createAbortController,
    createStreamHandler,
  ])

  const addMessagesFn = useCallback(
    async ({
      documentLogUuid,
      messages,
      toolCalls,
      trace,
    }: {
      documentLogUuid: string
      messages: ConversationMessage[]
      toolCalls?: ToolCall[]
      trace?: TraceContext
    }) => {
      const response = await fetch(
        ROUTES.api.documents.logs.detail(documentLogUuid).chat,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages, toolCalls, trace }),
        },
      )

      return createStreamHandler(response)
    },
    [createStreamHandler],
  )

  return useMemo(
    () => ({ runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream }),
    [runPromptFn, addMessagesFn, abortCurrentStream, hasActiveStream],
  )
}
