import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
} from '../../../lib'
import { CodeRunResult, CodeToolArgs } from './types'
import { normalizedResult, withSafeSandbox } from './sandbox'

export async function runCodeWithoutDependencies({
  code,
  language,
}: CodeToolArgs): PromisedResult<CodeRunResult, LatitudeError> {
  return withSafeSandbox(async (sandbox) => {
    const interpreter = (() => {
      if (language === 'python') return sandbox.shells.python
      if (language === 'javascript') return sandbox.shells.js

      throw new BadRequestError(`Language ${language} is not supported`)
    })()

    const result = await interpreter.run(code)
    return Result.ok(normalizedResult(result))
  })
}
