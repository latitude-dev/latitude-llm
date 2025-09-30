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
        // `parameters` is what users put in existing prompts.
        // In Vercel SDK v5 was renamed to `inputSchema` but we keep
        // supporting `parameters` for backward compatibility.
        // @ts-expect-error - inputSchema is not defined in ToolDefinition for
        // backward compatibility we support `parameters`
        const schema = value.inputSchema ?? jsonSchema(value.parameters)

        acc[key] = compactObject({
          ...omit(value, 'parameters'),
          inputSchema: schema,
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
