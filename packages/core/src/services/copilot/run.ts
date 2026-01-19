import { z } from 'zod'
import { LogSources } from '../../constants'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { BACKGROUND } from '../../telemetry'
import { runDocumentAtCommit } from '../commits/runDocumentAtCommit'
import { getCopilot } from './get'
import { database } from '../../client'

export async function runCopilot<S extends z.ZodType = z.ZodType>({
  path,
  parameters = {},
  schema,
  abortSignal,
  db = database,
}: {
  path: string
  parameters?: Record<string, unknown>
  schema?: S
  abortSignal?: AbortSignal
  db?: typeof database
}): Promise<
  TypedResult<
    S extends z.ZodType ? z.infer<S> : unknown,
    UnprocessableEntityError
  >
> {
  const copilotResult = await getCopilot({ path }, db)
  if (copilotResult.error) {
    return Result.error(
      new UnprocessableEntityError(copilotResult.error.message),
    )
  }

  const copilot = copilotResult.value
  const result = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: copilot.workspace.id }),
    workspace: copilot.workspace,
    commit: copilot.commit,
    document: copilot.document,
    parameters: parameters,
    source: LogSources.API,
    abortSignal: abortSignal,
  }).then((r) => r.unwrap())

  const error = await result.error
  if (error) throw error

  const response = await result.lastResponse
  if (response?.streamType !== 'object') {
    return Result.error(
      new UnprocessableEntityError('Copilot response is not an object'),
    )
  }

  if (schema) {
    const result = schema.safeParse(response.object)
    if (result.error) {
      return Result.error(
        new UnprocessableEntityError(
          `Copilot response does not follow the expected schema: ${result.error.message}`,
        ),
      )
    }
    return Result.ok(result.data as S extends z.ZodType ? z.infer<S> : unknown)
  }

  return Result.ok(
    response.object as S extends z.ZodType ? z.infer<S> : unknown,
  )
}
