import { Message } from '@latitude-data/constants/messages'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { AssembledTrace } from '@latitude-data/core/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { fetchConversationWithMessages } from '@latitude-data/core/data-access/conversations/fetchConversationWithMessages'
import { NextRequest, NextResponse } from 'next/server'

export type ConversationTracesResponse = {
  traces: AssembledTrace[]
  messages: Message[]
  outputMessages: Message[]
  totalTokens: number
  totalDuration: number
  totalCost: number
  traceCount: number
  documentLogUuid: string | null
  commitUuid: string | null
  promptName: string | null
  parameters: Record<string, unknown> | null
  startedAt: string | null
}

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          conversationId: string
        }
        workspace: Workspace
      },
    ) => {
      const { conversationId } = params
      const projectId = Number(request.nextUrl.searchParams.get('projectId'))
      const commitUuid =
        request.nextUrl.searchParams.get('commitUuid') ?? undefined
      const documentUuid =
        request.nextUrl.searchParams.get('documentUuid') ?? undefined

      const result = await fetchConversationWithMessages({
        workspace,
        projectId,
        documentLogUuid: conversationId,
        commitUuid,
        documentUuid,
      })

      if (!result.ok || !result.value) {
        return NextResponse.json(
          {
            traces: [],
            messages: [],
            outputMessages: [],
            totalTokens: 0,
            totalDuration: 0,
            totalCost: 0,
            traceCount: 0,
            documentLogUuid: null,
            commitUuid: null,
            promptName: null,
            parameters: null,
            startedAt: null,
          },
          { status: 200 },
        )
      }

      const conversation = result.value

      return NextResponse.json(
        {
          traces: conversation.traces,
          messages: conversation.messages,
          outputMessages: conversation.outputMessages,
          totalTokens: conversation.totalTokens,
          totalDuration: conversation.totalDuration,
          totalCost: conversation.totalCost,
          traceCount: conversation.traceCount,
          documentLogUuid: conversation.documentLogUuid,
          commitUuid: conversation.commitUuid,
          promptName: conversation.promptName,
          parameters: conversation.parameters,
          startedAt: conversation.startedAt,
        },
        { status: 200 },
      )
    },
  ),
)
