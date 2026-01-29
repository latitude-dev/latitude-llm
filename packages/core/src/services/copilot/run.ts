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
}): Promise<TypedResult<S extends z.ZodType ? z.infer<S> : unknown, Error>> {
  const copilotResult = await getCopilot({ path }, db)
  if (copilotResult.error) {
    return Result.error(
      new UnprocessableEntityError(copilotResult.error.message),
    )
  }

  const { workspace, commit, document } = copilotResult.unwrap()
  const result = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: workspace.id }),
    workspace,
    commit,
    document,
    parameters: parameters,
    source: LogSources.API,
    abortSignal: abortSignal,
  })
  if (!Result.isOk(result)) return result
  const run = result.value

  const error = await run.error
  if (error) return Result.error(error)

  const response = await run.lastResponse
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
