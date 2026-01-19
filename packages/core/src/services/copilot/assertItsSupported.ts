import { env } from '@latitude-data/env'
import { Result } from '../../lib/Result'
import { BadRequestError } from '../../lib/errors'

export function assertCopilotIsSupported(cloudMessage: string) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new BadRequestError(cloudMessage))
  }

  if (env.LATITUDE_ENTERPRISE_MODE) {
    if (!env.ENTERPRISE_COPILOT_WORKSPACE_NAME) {
      return Result.error(
        new BadRequestError('ENTERPRISE_COPILOT_WORKSPACE_NAME is not set'),
      )
    }

    if (!env.ENTERPRISE_COPILOT_PROJECT_NAME) {
      return Result.error(
        new BadRequestError('ENTERPRISE_COPILOT_PROJECT_NAME is not set'),
      )
    }

    return Result.nil()
  }

  if (!env.COPILOT_WORKSPACE_API_KEY) {
    return Result.error(
      new BadRequestError('COPILOT_WORKSPACE_API_KEY is not set'),
    )
  }

  if (!env.COPILOT_PROJECT_ID) {
    return Result.error(new BadRequestError('COPILOT_PROJECT_ID is not set'))
  }

  return Result.nil()
}
