import { z } from 'zod'
import { User, Workspace, Project } from '../../../../schema/types'
import { PromisedResult } from '../../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../lib/Result'
import { TelemetryContext } from '../../../../telemetry'
import { ToolExecutionOptions } from 'ai'
import { LatteTool } from '@latitude-data/constants/latte'

export type LatteToolContext = {
  context: TelemetryContext
  workspace: Workspace
  project: Project
  user: User
  threadUuid: string
  toolName: LatteTool
  toolCall: ToolExecutionOptions
}
export type LatteToolFn<P extends { [key: string]: unknown } = {}> = (
  parameters: P,
  context: LatteToolContext,
) => PromisedResult<unknown>

export const defineLatteTool = <
  S extends z.ZodSchema | undefined = undefined,
  P extends { [key: string]: unknown } = S extends z.ZodSchema
    ? z.infer<S>
    : {},
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

    return await cb(result.data, context)
  }
}
