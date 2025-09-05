import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { getLatteThread } from '@latitude-data/core/services/latte/getThread'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
        params,
      }: {
        workspace: Workspace
        params: { uuid: string }
      },
    ) => {
      const threadUuid = params.uuid

      const result = await getLatteThread({
        workspace,
        threadUuid,
      })

      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
