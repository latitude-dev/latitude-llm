import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import { getResultsForConversation } from '@latitude-data/core/data-access/conversations/getResultsForConversation'

export type ConversationEvaluationsResponse = {
  results: ResultWithEvaluationV2[]
}

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
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

      const results = await getResultsForConversation({
        workspace,
        conversationId,
      }).then((r) => r.unwrap())

      return NextResponse.json({ results }, { status: 200 })
    },
  ),
)
