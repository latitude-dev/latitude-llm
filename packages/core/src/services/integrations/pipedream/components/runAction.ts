import { NotFoundError } from '@latitude-data/constants/errors'
import { PipedreamIntegration } from '../../../../schema/models/types/Integration'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  fillConfiguredProps,
  isIntegrationConfigured,
} from './fillConfiguredProps'
import { Result, TypedResult } from '../../../../lib/Result'
import { getPipedreamClient } from '../apps'
import { RunActionResponse } from '@pipedream/sdk'

function getResultFromActionResponse(
  response: RunActionResponse,
): TypedResult<unknown, Error> {
  // When an error occurs, the error is usually logged
  if (Array.isArray(response.os)) {
    // The error is not always in the first log
    for (const log of response.os) {
      const output = log as {
        ts?: number
        k?: 'error'
        err?: { name: string; message: string; stack: string }
      }
      if (output.k === 'error' && output.err) {
        const err = output.err
        const error = new Error(err.message)
        error.name = err.name
        // Optionally attach stack if needed
        // (error as any).stack = err.stack;
        return Result.error(error)
      }
    }
  }

  // Expected return value should be here
  if (response.ret) return Result.ok(response.ret)

  // If no return value is found, we can check on exported values
  if (typeof response.exports === 'object' && response.exports !== null) {
    // This should be the same as response.ret, but we're checking just in case
    if ('$return_value' in response.exports) {
      return Result.ok(response.exports['$return_value'])
    }

    // Some tools may return a summary of the result
    if ('$summary' in response.exports) {
      return Result.ok(response.exports['$summary'])
    }
  }

  // No error or return statement has been found, we can try to return the os logs
  if (Array.isArray(response.os) && response.os.length > 0) {
    return Result.ok(response.os)
  }

  // No error, return statement, or os logs have been found, we can return a fallback error
  return Result.error(new Error('Tool did not return a value'))
}

export async function runAction({
  integration,
  toolName,
  args,
}: {
  integration: PipedreamIntegration
  toolName: string
  args: Record<string, unknown>
}): PromisedResult<unknown, Error> {
  if (!isIntegrationConfigured(integration)) {
    return Result.error(
      new NotFoundError(
        `Integration '${integration.name}' has not been configured.`,
      ),
    )
  }

  const pipedreamResult = getPipedreamClient()
  if (!Result.isOk(pipedreamResult)) return pipedreamResult
  const pipedream = pipedreamResult.unwrap()

  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId: toolName,
    configuredProps: args,
  })
  if (!Result.isOk(configuredPropsResult)) return configuredPropsResult
  const configuredProps = configuredPropsResult.unwrap()

  // We need to do this to obtain the dynamicPropsId. I do not know why, ask Pipedream.
  const reload = await pipedream.components.reloadProps({
    id: toolName,
    externalUserId: integration.configuration.externalUserId,
    configuredProps,
  })

  const response = await pipedream.actions.run({
    id: toolName,
    externalUserId: integration.configuration.externalUserId,
    configuredProps,
    dynamicPropsId: reload.dynamicProps?.id,
  })

  return getResultFromActionResponse(response)
}
