'use server'

import { authProcedure } from '$/actions/procedures'
import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { env } from '@latitude-data/env'
import { z } from 'zod'

export const submitToolResultAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      toolCallId: z.string(),
      result: z.string(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const { workspace } = ctx
    const gatewayUrl = buildGatewayUrl()

    const repo = new ApiKeysRepository(workspace.id)
    const token = await repo
      .findAll()
      .then((r) => r.unwrap())
      .then((r) => r.map((k) => k.token).at(0))

    const response = await fetch(`${gatewayUrl}/api/v3/tools/results`, {
      method: 'POST',
      body: JSON.stringify(input),
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
