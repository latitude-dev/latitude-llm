import { NotFoundError } from '@latitude-data/constants/errors'
import type { PipedreamIntegration } from '../../../../browser'
import type { PromisedResult } from '../../../../lib/Transaction'
import { fillConfiguredProps, isIntegrationConfigured } from './fillConfiguredProps'
import { Result } from '../../../../lib/Result'
import { getPipedreamEnvironment } from '../apps'
import { createBackendClient } from '@pipedream/sdk'

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
      new NotFoundError(`Integration '${integration.name}' has not been configured.`),
    )
  }

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    return Result.error(pipedreamEnv.error!)
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())
  const configuredPropsResult = await fillConfiguredProps({
    pipedream,
    integration,
    componentId: toolName,
    configuredProps: args,
  })

  if (!Result.isOk(configuredPropsResult)) {
    return Result.error(configuredPropsResult.error)
  }

  // We need to do this to obtain the dynamicPropsId. I do not know why, ask Pipedream.
  const reload = await pipedream.reloadComponentProps({
    externalUserId: integration.configuration.externalUserId,
    componentId: toolName,
    configuredProps: configuredPropsResult.unwrap(),
  })

  const result = await pipedream.runAction({
    externalUserId: integration.configuration.externalUserId,
    actionId: toolName,
    configuredProps: configuredPropsResult.unwrap(),
    dynamicPropsId: reload.dynamicProps?.id,
  })

  if (result.os.length > 0) {
    // The error is not always in the first log
    for (const log of result.os) {
      const output = log as {
        ts?: number
        k?: 'error'
        err?: { name: string; message: string; stack: string }
      }

      if (output.k === 'error' && output.err) {
        return Result.error(new Error(output.err.message))
      }
    }
  }

  return Result.ok(result.ret)
}
