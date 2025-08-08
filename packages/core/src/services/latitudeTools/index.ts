import { LatitudeTool } from '@latitude-data/constants'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { LATITUDE_TOOLS } from './tools'

export async function executeLatitudeToolCall({
  latitudeTool,
  args,
}: {
  latitudeTool: LatitudeTool
  args: Record<string, unknown>
}): PromisedResult<unknown, LatitudeError> {
  const method = LATITUDE_TOOLS.find(
    (tool) => tool.name === latitudeTool,
  )?.method
  if (!method) {
    return Result.error(
      new BadRequestError(`Unsupported built-in tool: ${latitudeTool}`),
    )
  }

  try {
    const response = await method(args)
    return response
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}
