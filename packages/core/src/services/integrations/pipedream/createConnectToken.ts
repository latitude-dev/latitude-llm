import { type Workspace } from '../../../schema/models/types/Workspace'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPipedreamClient } from './apps'

export async function createConnectToken({
  workspace,
}: {
  workspace: Workspace
}): PromisedResult<{
  token: string
  expiresAt: string
  externalUserId: string
}> {
  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  try {
    const { token, expiresAt } = await pipedream.tokens.create({
      externalUserId: String(workspace.id),
    })

    return Result.ok({
      externalUserId: String(workspace.id),
      token,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
