import { CodeRunResult, CodeToolArgs } from './types'
import { normalizedResult, withSafeSandbox } from './sandbox'
import { BadRequestError } from './../../../lib/errors'
import { LatitudeError } from './../../../lib/errors'
import { PromisedResult } from './../../../lib/Transaction'
import { Result } from './../../../lib/Result'

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
