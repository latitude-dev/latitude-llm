import { omit } from 'lodash-es'
import { VercelTools } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Tool, jsonSchema } from 'ai'
import { compactObject } from '../../../lib/compactObject'
import { Result } from '../../../lib/Result'

export const buildTools = (tools: VercelTools | undefined) => {
  if (!tools) return Result.ok(undefined)

  try {
    const data = Object.entries(tools).reduce<Record<string, Tool>>(
      (acc, [key, value]) => {
        if (value.type === 'provider-defined') {
          acc[key] = {
            ...value,
            name: key, // Add the required name property
          }
          return acc
        }

        // INFO:
        // Vercel v5 tools are defined with a `inputSchema` property
        // We were using `parameters`
        // @ts-expect-error - Already changed in the types but we allow to pass `parameters` for backward compatibility
        const parameters = value.parameters

        acc[key] = compactObject({
          ...omit(value, 'parameters'),
          // NOTE: In AI SDK v5, tool definitions use `inputSchema` instead of `parameters`
          // `jsonSchema` is not validating the schema.
          // To work you would need to pass `{ validate }`
          // option. But our schema is dynamic so this
          // does not makes sense here
          inputSchema: jsonSchema(parameters),
        }) as unknown as Tool

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
