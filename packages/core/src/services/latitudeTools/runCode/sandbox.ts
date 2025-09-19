import { CodeSandbox, type Sandbox } from '@codesandbox/sdk'
import { env } from '@latitude-data/env'
import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { CodeRunResult } from './types.js'

export function normalizedResult(result: CodeRunResult): CodeRunResult {
  const ansiEscapeCodes = new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g')
  return {
    ...result,
    output: result.output.replace(ansiEscapeCodes, ''),
  }
}

async function createSandbox() {
  try {
    if (!env.CODESANDBOX_API_KEY) {
      return Result.error(new BadRequestError('CODESANDBOX_API_KEY is not set'))
    }
    const sdk = new CodeSandbox(env.CODESANDBOX_API_KEY)
    const sandbox = await sdk.sandbox.create()
    return Result.ok(sandbox)
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}

export const withSafeSandbox = async <
  V,
  T extends TypedResult<V, LatitudeError>,
>(
  fn: (sandbox: Sandbox) => Promise<T>,
  maxTime: number = 60_000,
): Promise<T> => {
  const sandboxResult = await createSandbox()
  if (!Result.isOk(sandboxResult)) throw sandboxResult.error
  const sandbox = sandboxResult.unwrap()

  const timeoutPromise = new Promise<T>((resolve) => {
    setTimeout(() => {
      resolve(
        Result.error(
          new BadRequestError(`Code execution timed out after ${maxTime} ms.`),
        ) as T,
      )
    }, maxTime)
  })

  try {
    return await Promise.race([fn(sandbox), timeoutPromise])
  } catch (error) {
    return Result.error(error as LatitudeError) as T
  } finally {
    sandbox.shutdown()
  }
}
