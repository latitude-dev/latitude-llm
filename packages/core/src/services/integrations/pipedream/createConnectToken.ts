import { createBackendClient } from '@pipedream/sdk/server'
import { PromisedResult } from '../../../lib/Transaction'
import { env } from '@latitude-data/env'
import { Result } from '../../../lib/Result'
import { UnauthorizedError } from '@latitude-data/constants/errors'
import { Workspace } from '../../../browser'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'

export async function createConnectToken({
  workspace,
}: {
  workspace: Workspace
}): PromisedResult<{
  token: string
  expiresAt: string
  externalUserId: string
}> {
  const { PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, PIPEDREAM_PROJECT_ID } =
    env
  if (
    !PIPEDREAM_CLIENT_ID ||
    !PIPEDREAM_CLIENT_SECRET ||
    !PIPEDREAM_PROJECT_ID
  ) {
    return Result.error(
      new UnauthorizedError(
        'Pipedream credentials are not set. Please set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET and PIPEDREAM_PROJECT_ID in your environment variables.',
      ),
    )
  }

  const pipedream = createBackendClient({
    environment: 'development',
    credentials: {
      clientId: PIPEDREAM_CLIENT_ID,
      clientSecret: PIPEDREAM_CLIENT_SECRET,
    },
    projectId: PIPEDREAM_PROJECT_ID,
  })

  const externalUserId = `${workspace.id}:${generateUUIDIdentifier()}`

  try {
    const { token, expires_at: expiresAt } = await pipedream.createConnectToken(
      {
        external_user_id: externalUserId,
      },
    )

    return Result.ok({
      externalUserId,
      token,
      expiresAt,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
