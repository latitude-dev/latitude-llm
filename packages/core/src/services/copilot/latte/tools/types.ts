import { z } from 'zod'
import { User, Workspace, Project } from '../../../../schema/types'
import { PromisedResult } from '../../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../lib/Result'
import { TelemetryContext } from '../../../../telemetry'
import { LatteTool } from '@latitude-data/constants/latte'
import { ToolExecutionOptions } from '@latitude-data/constants'

export type LatteToolContext = {
  context: TelemetryContext
  workspace: Workspace
  project: Project
  user: User
  threadUuid: string
  toolName: LatteTool
  toolCall: ToolExecutionOptions
}
export type LatteToolFn<
  P extends Record<string, unknown> = Record<string, never>,
> = (parameters: P, context: LatteToolContext) => PromisedResult<unknown>

export const defineLatteTool = <
  S extends z.ZodType | undefined = undefined,
  P extends Record<string, unknown> = S extends z.ZodType
    ? z.infer<S> extends Record<string, unknown>
      ? z.infer<S>
      : Record<string, never>
    : Record<string, never>,
>(
  cb: LatteToolFn<P>,
  schema?: S,
): LatteToolFn<P> => {
  return async (parameters: P, context: LatteToolContext) => {
    if (!schema) return await cb(parameters, context)

    const result = schema.safeParse(parameters)
    if (!result.success) {
      return Result.error(
        new BadRequestError(
          `Invalid parameters for tool '${context.toolName}': ${result.error.message}`,
        ),
      )
    }

    return await cb(result.data as P, context)
  }
}
