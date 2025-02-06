import { RunErrorCodes } from '@latitude-data/constants/errors'
import { CoreTool, jsonSchema } from 'ai'

import { Result } from '../../../lib'
import { compactObject } from '../../../lib/compactObject'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'

export type AITools = Record<
  string,
  { description?: string; parameters: Record<string, any> }
>
export const buildTools = (tools: AITools | undefined) => {
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
