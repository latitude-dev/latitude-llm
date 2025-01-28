import {
  CodeSandbox,
  type Sandbox,
} from '../../../../node_modules/@codesandbox/sdk/dist/cjs/index.js'
import {
  BadRequestError,
  InferedReturnType,
  LatitudeError,
  Result,
  TypedResult,
} from '../../../lib'
import { env } from '@latitude-data/env'
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
  if (sandboxResult.error) throw sandboxResult.error
  const sandbox = sandboxResult.unwrap()

  let timeout: InferedReturnType<typeof setTimeout> | undefined
  try {
    timeout = setTimeout(() => {
      throw new BadRequestError('Code execution timed out')
    }, maxTime)

    return await fn(sandbox)
  } catch (err) {
    // @ts-ignore – idk how to fix this lol
    return Result.error(err as LatitudeError)
  } finally {
    if (timeout) clearTimeout(timeout)
    sandbox.shutdown()
  }
}
