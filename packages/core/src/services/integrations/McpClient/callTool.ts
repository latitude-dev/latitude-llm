import { IntegrationDto } from '../../../browser'
import { LatitudeError, PromisedResult, Result } from '../../../lib'
import { getMcpClient } from './getMcpClient'
import { touchIntegration } from '../touch'

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
}: {
  integration: IntegrationDto
  toolName: string
  args: Record<string, unknown>
}): PromisedResult<unknown, LatitudeError> {
  const clientResult = await getMcpClient(integration)
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
    return Result.error(
      new LatitudeError(
        `Error listing tools from Integration '${integration.name}': ${error.message}`,
      ),
    )
  }
}
