import { z } from 'zod'
import { Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { Message, ToolCall } from '@latitude-data/compiler'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../lib/Result'

type LatteToolContext = {
  workspace: Workspace
  threadUuid: string
  messages: Message[]
  tool: ToolCall
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
          `Invalid parameters for tool '${context.tool.name}': ${result.error.message}`,
        ),
      )
    }

    return await cb(result.data, context)
  }
}
