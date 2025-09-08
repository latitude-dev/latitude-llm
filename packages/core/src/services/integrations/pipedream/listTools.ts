import { McpTool } from '@latitude-data/constants'
import { getApp } from './apps'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { pipedreamComponentToToolDefinition } from './helpers/ComponentConverter'

export async function listPipedreamIntegrationTools(
  appName: string,
): PromisedResult<McpTool[]> {
  const appResult = await getApp({
    name: appName,
  })

  if (!Result.isOk(appResult)) return appResult
  const app = appResult.value

  const tools = app.tools.map((tool) =>
    pipedreamComponentToToolDefinition(tool),
  )
  return Result.ok(tools)
}
