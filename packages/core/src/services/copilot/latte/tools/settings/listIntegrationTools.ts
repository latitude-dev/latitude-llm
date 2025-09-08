import { z } from 'zod'
import { defineLatteTool } from '../types'
import { fixToolSchema } from '../../../../integrations/McpClient/listTools/fixToolSchema'
import { JSONSchema7 } from 'json-schema'
import { McpTool } from '@latitude-data/constants'
import { listPipedreamIntegrationTools } from '../../../../integrations/pipedream/listTools'
import { Result } from '../../../../../lib/Result'

const listIntegrationTools = defineLatteTool(
  async ({ integrationAppName }) => {
    const toolsResult = await listPipedreamIntegrationTools(integrationAppName)
    if (!Result.isOk(toolsResult)) return toolsResult

    const tools = toolsResult.value
    const fixedTools = tools.map((tool) => ({
      ...tool,
      inputSchema: fixToolSchema(tool.inputSchema as JSONSchema7),
    }))
    return Result.ok(fixedTools as McpTool[])
  },
  z.object({
    integrationAppName: z.string(),
  }),
)

export default listIntegrationTools
