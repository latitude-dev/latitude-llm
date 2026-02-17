'use server'

import { z } from 'zod'
import { authProcedure } from '$/actions/procedures'
import { NotFoundError } from '@latitude-data/constants/errors'
import { selectFirstApiKey } from '@latitude-data/core/queries/apiKeys/selectFirst'
import { env } from '@latitude-data/env'

export const submitToolResultAction = authProcedure
  .inputSchema(
    z.object({
      toolCallId: z.string(),
      result: z.string(),
      isError: z.boolean().optional().default(false),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { workspace } = ctx
    const gatewayUrl = buildGatewayUrl()

    const firstApiKey = await selectFirstApiKey({ workspaceId: workspace.id })
    const token = firstApiKey?.token
    if (!token) throw new NotFoundError('No API key found')

    const response = await fetch(`${gatewayUrl}/api/v3/tools/results`, {
      method: 'POST',
      body: JSON.stringify(parsedInput),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(
        `Failed to submit tool result with status ${response.status} ${response.statusText}`,
      )
    }
  })

function buildGatewayUrl() {
  const host = env.GATEWAY_HOSTNAME
  const port = env.GATEWAY_PORT
  const protocol = env.GATEWAY_SSL ? 'https' : 'http'

  return `${protocol}://${host}` + (port ? `:${port}` : '')
}
