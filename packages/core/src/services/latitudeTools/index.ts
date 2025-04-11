import { LatitudeTool } from '@latitude-data/constants'
import { LATITUDE_TOOLS } from './tools'
import { BadRequestError } from './../../lib/errors'
import { LatitudeError } from './../../lib/errors'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

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
