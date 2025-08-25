import type { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'
import { listConnectedIntegrationsByApp } from '@latitude-data/core/services/integrations/connectedByAppSlug'

type ListArguments = Parameters<typeof listConnectedIntegrationsByApp>[0]

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const { searchParams } = new URL(request.url)
      const withTools = searchParams.get('withTools') || undefined
      const withTriggers = searchParams.get('withTriggers') || undefined
      const args: ListArguments = { workspace }

      if (withTools !== undefined) {
        args.withTools = withTools === 'true'
      }

      if (withTriggers !== undefined) {
        args.withTriggers = withTriggers === 'true'
      }

      const integrations = await listConnectedIntegrationsByApp(args).then((r) => r.unwrap())
      return NextResponse.json(integrations, { status: 200 })
    },
  ),
)
