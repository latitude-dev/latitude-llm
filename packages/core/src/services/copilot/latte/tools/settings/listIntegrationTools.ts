import { z } from 'zod'
import { defineLatteTool } from '../types'
import { fixToolSchema } from '../../../../integrations/McpClient/listTools/fixToolSchema'
import { JSONSchema7 } from 'json-schema'
import { McpTool } from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { listPipedreamIntegrationTools } from '../../../../integrations/pipedream/listTools'
import { Result } from '../../../../../lib/Result'

const listIntegrationTools = defineLatteTool(
  async ({ integrationAppName }) => {
    const toolsResult = await listPipedreamIntegrationTools(integrationAppName)
    if (!Result.isOk(toolsResult)) {
      return Result.error(new LatitudeError(toolsResult.error.message))
    }

    const tools = toolsResult.unwrap()
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
