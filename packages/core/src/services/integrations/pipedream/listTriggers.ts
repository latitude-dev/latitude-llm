import { McpTool } from '@latitude-data/constants'
import { PipedreamIntegration } from '../../../browser'
import { PromisedResult } from '../../../lib/Transaction'
import { getApp } from './apps'
import { Result } from '../../../lib/Result'
import { pipedreamComponentToTriggerDefinition } from './helpers/ComponentConverter'

export async function listPipedreamIntegrationTriggers(
  integration: PipedreamIntegration,
): PromisedResult<McpTool[]> {
  const appResult = await getApp({
    name: integration.configuration.appName,
  })

  if (!Result.isOk(appResult)) return appResult
  const app = appResult.unwrap()

  const triggers = app.triggers.map(pipedreamComponentToTriggerDefinition)
  return Result.ok(triggers)
}
