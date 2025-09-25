import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import {
  Message as ConversationMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { ROUTES } from '$/services/routes'
import { DocumentVersion, TraceContext } from '@latitude-data/core/browser'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { useCallback, useMemo } from 'react'

export function useRunDocument({
  document,
  commit,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
}) {
  const { createStreamHandler, abortCurrentStream, hasActiveStream } =
    useStreamHandler()

  const runDocument = useCallback(
    async ({
      parameters,
      userMessage,
    }: {
      parameters: Record<string, unknown>
      userMessage?: string
    }) => {
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
          }),
        },
      )

      return createStreamHandler(response)
    },
    [
      document.documentUuid,
      document.path,
      commit.projectId,
      commit.uuid,
      createStreamHandler,
    ],
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
    () => ({ runDocument, addMessages, abortCurrentStream, hasActiveStream }),
    [runDocument, addMessages, abortCurrentStream, hasActiveStream],
  )
}
