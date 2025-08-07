import type { McpTool } from '@latitude-data/constants'
import type { PipedreamIntegration } from '../../../browser'
import { getApp } from './apps'
import { Result } from '../../../lib/Result'
import type { PromisedResult } from '../../../lib/Transaction'
import { pipedreamComponentToToolDefinition } from './helpers/ComponentConverter'

export async function listPipedreamIntegrationTools(
  integration: PipedreamIntegration,
): PromisedResult<McpTool[]> {
  const appResult = await getApp({
    name: integration.configuration.appName,
  })

  if (!Result.isOk(appResult)) return appResult
  const app = appResult.unwrap()

  const tools = app.tools.map((tool) => pipedreamComponentToToolDefinition(tool))
  return Result.ok(tools)
}
