import type { VercelTools } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { type Tool, jsonSchema } from 'ai'
import { compactObject } from '../../../lib/compactObject'
import { Result } from '../../../lib/Result'

export const buildTools = (tools: VercelTools | undefined) => {
  if (!tools) return Result.ok(undefined)

  try {
    const data = Object.entries(tools).reduce<Record<string, Tool>>((acc, [key, value]) => {
      if (value.type === 'provider-defined') {
        acc[key] = value
        return acc
      }

      acc[key] = compactObject({
        ...value,
        // NOTE: `jsonSchema`
        // is not validating the schema.
        // To work you would need to pass `{ validate }`
        // option. But our schema is dynamic so this
        // does not makes sense here
        parameters: jsonSchema(value.parameters),
      }) as unknown as Tool

      return acc
    }, {})
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
