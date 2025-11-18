import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '../../../schema/models/types/Integration'
import { LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { runAction } from '../pipedream/components/runAction'
import { captureException } from '../../../utils/datadogCapture'

export async function callIntegrationTool({
  integration,
  toolName,
  args,
}: {
  integration: IntegrationDto
  toolName: string
  args: Record<string, unknown>
}): PromisedResult<unknown, LatitudeError> {
  if (integration.type === IntegrationType.Pipedream) {
    const callResult = await runAction({
      integration: integration as PipedreamIntegration,
      toolName,
      args,
    })

    if (!Result.isOk(callResult)) {
      return Result.error(new LatitudeError(callResult.error.message))
    }

    return callResult
  } else {
    const error = new LatitudeError(
      'Hosted MCP clients are no longer supported. Please contact support.',
    )

    captureException(error)

    return Result.error(error)
  }
}
