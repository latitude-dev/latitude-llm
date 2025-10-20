import { McpTool } from '@latitude-data/constants'

import { PipedreamComponent, PipedreamComponentType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { getApp } from './apps'
import { pipedreamComponentToToolDefinition } from './helpers/ComponentConverter'

export async function listPipedreamIntegrationTools(
  appName: string,
): PromisedResult<McpTool[]> {
  const appResult = await getApp({
    name: appName,
    withConfig: true,
  })

  if (!Result.isOk(appResult)) return appResult
  const app = appResult.value

  const tools = app.tools.map(
    (tool: PipedreamComponent<PipedreamComponentType.Tool>) =>
      pipedreamComponentToToolDefinition(tool),
  )
  return Result.ok(tools)
}
