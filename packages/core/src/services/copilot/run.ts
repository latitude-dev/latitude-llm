import { z } from 'zod'
import { LogSources } from '../../browser'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { BACKGROUND } from '../../telemetry'
import { runDocumentAtCommit } from '../commits/runDocumentAtCommit'
import { Copilot } from './shared'

export async function runCopilot<S extends z.ZodSchema = z.ZodAny>({
  copilot,
  parameters = {},
  schema,
}: {
  copilot: Copilot
  parameters?: Record<string, unknown>
  schema?: S
}) {
  const result = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: copilot.workspace.id }),
    workspace: copilot.workspace,
    commit: copilot.commit,
    document: copilot.document,
    parameters: parameters,
    source: LogSources.API,
  }).then((r) => r.unwrap())

  const error = await result.error
  if (error) throw error

  const response = await result.lastResponse
  if (response?.streamType !== 'object') {
    return Result.error(
      new UnprocessableEntityError('Copilot response is not an object'),
    )
  }

  let output: S extends z.ZodSchema ? z.infer<S> : unknown = response.object
  if (schema) {
    const result = schema.safeParse(response.object)
    if (result.error) {
      return Result.error(
        new UnprocessableEntityError(
          `Copilot response does not follow the expected schema: ${result.error.message}`,
        ),
      )
    }
    output = result.data
  }

  return Result.ok(output)
}
