import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { ROUTES } from '$/services/routes'
import {
  Message as ConversationMessage,
  ToolCall,
} from '@latitude-data/constants/messages'
import { TraceContext } from '@latitude-data/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { useCallback, useMemo } from 'react'

export function useRunDocument({
  commit,
}: {
  commit: ICommitContextType['commit']
}) {
  const {
    createStreamHandler,
    abortCurrentStream,
    hasActiveStream,
    createAbortController,
  } = useStreamHandler()
  const runDocument = useCallback(
    async ({
      document,
      parameters,
      userMessage,
      aiParameters = false,
    }: {
      document: DocumentVersion
      parameters: Record<string, unknown>
      userMessage?: string
      aiParameters?: boolean
    }) => {
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
            projectId: commit.projectId,
            commitUuid: commit.uuid,
            parameters: parameters ?? {},
            stream: true,
            userMessage,
            aiParameters,
          }),
          signal: signal,
        },
      )

      return createStreamHandler(response, signal)
    },
    [commit.projectId, commit.uuid, createAbortController, createStreamHandler],
  )

  const addMessages = useCallback(
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
      const signal = createAbortController()

      const response = await fetch(
        ROUTES.api.documents.logs.detail(documentLogUuid).chat,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages, toolCalls, trace }),
          signal,
        },
      )

      return createStreamHandler(response, signal)
    },
    [createAbortController, createStreamHandler],
  )

  return useMemo(
    () => ({ runDocument, addMessages, abortCurrentStream, hasActiveStream }),
    [runDocument, addMessages, abortCurrentStream, hasActiveStream],
  )
}
