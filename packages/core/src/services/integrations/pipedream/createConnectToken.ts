import { Workspace } from '../../../schema/types'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getPipedreamClient } from './apps'

export async function createConnectToken({
  workspace,
  externalUserId,
}: {
  workspace: Workspace
  externalUserId: string
}): PromisedResult<{
  token: string
  expiresAt: string
  externalUserId: string
}> {
  if (!externalUserId.startsWith(`${workspace.id}:`)) {
    return Result.error(new BadRequestError('Invalid external user ID'))
  }

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  try {
    const { token, expiresAt } = await pipedream.tokens.create({
      externalUserId,
    })

    return Result.ok({
      externalUserId,
      token,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
