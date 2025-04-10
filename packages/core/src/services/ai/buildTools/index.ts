import { RunErrorCodes } from '@latitude-data/constants/errors'
import { CoreTool, jsonSchema } from 'ai'
import { compactObject } from '../../../lib/compactObject'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { ToolDefinitionsMap } from '@latitude-data/constants'
import { Result } from './../../../lib/Result'

export const buildTools = (tools: ToolDefinitionsMap | undefined) => {
  if (!tools) return Result.ok(undefined)
  try {
    const data = Object.entries(tools).reduce<Record<string, CoreTool>>(
      (acc, [key, value]) => {
        acc[key] = compactObject({
          ...value,
          parameters: jsonSchema(value.parameters),
        }) as unknown as CoreTool

        return acc
      },
      {},
    )
    return Result.ok(data)
  } catch (e) {
    const error = e as Error
    return Result.error(
      new ChainError({
        code: RunErrorCodes.AIProviderConfigError,
        message: `Error building "tools": ${error.message}`,
      }),
    )
  }
}
