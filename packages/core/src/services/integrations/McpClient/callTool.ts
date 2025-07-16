import { IntegrationDto, PipedreamIntegration } from '../../../browser'
import { touchIntegration } from '../touch'
import { LatitudeError } from './../../../lib/errors'
import { PromisedResult } from './../../../lib/Transaction'
import { Result } from './../../../lib/Result'
import { IntegrationType } from '@latitude-data/constants'
import { runAction } from '../pipedream/components'
import { StreamManager } from '../../../lib/streamManager'

type ResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: unknown }
  | unknown

function parseToolResultContent(content: ResultContent[] | unknown): unknown {
  if (!Array.isArray(content)) return content

  if (content.every((c) => c.type === 'text')) {
    const text = content.map((c) => c.text).join('\n')
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return content
}

export async function callIntegrationTool({
  integration,
  toolName,
  args,
  streamManager,
}: {
  integration: IntegrationDto
  toolName: string
  args: Record<string, unknown>
  streamManager: StreamManager
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
  }

  if (!streamManager.mcpClientManager) {
    return Result.error(new LatitudeError('MCP Client Manager not provided'))
  }

  const clientResult = await streamManager.mcpClientManager.getClient(
    integration,
    streamManager,
  )
  if (clientResult.error) {
    return clientResult
  }
  const client = clientResult.unwrap()

  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    })

    const touchResult = await touchIntegration(integration.id)
    if (touchResult.error) {
      return Result.error(new LatitudeError(touchResult.error.message))
    }

    const content = parseToolResultContent(result.content)
    if (result.isError) {
      return Result.error(
        new LatitudeError(
          typeof content === 'string' ? content : JSON.stringify(content),
        ),
      )
    }

    return Result.ok(content)
  } catch (err) {
    const error = err as Error
    return Result.error(new LatitudeError(error.message))
  }
}
