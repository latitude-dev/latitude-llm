import { IntegrationType } from '@latitude-data/constants'
import {
  IntegrationDto,
  PipedreamIntegration,
} from '../../../schema/models/types/Integration'
import { LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { StreamManager } from '../../../lib/streamManager'
import { PromisedResult } from '../../../lib/Transaction'
import { runAction } from '../pipedream/components/runAction'
import { touchIntegration } from '../touch'

const FIVE_MINUTES = 5 * 60 * 1000

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

  // Look up headers for this specific integration by name
  const integrationHeaders = streamManager.mcpHeaders?.[integration.name]
  const clientResult = await streamManager.mcpClientManager.getClient(
    integration,
    { runtimeHeaders: integrationHeaders },
  )
  if (clientResult.error) {
    return clientResult
  }
  const client = clientResult.unwrap()

  try {
    const result = await client.callTool(
      {
        name: toolName,
        arguments: args,
      },
      undefined,
      {
        timeout: FIVE_MINUTES,
      },
    )

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
