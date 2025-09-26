import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { normalizedResult, withSafeSandbox } from './sandbox'
import { CodeRunResult, CodeToolArgs } from './types'

export async function runCodeWithoutDependencies({
  code,
  language,
}: CodeToolArgs): PromisedResult<CodeRunResult, LatitudeError> {
  return withSafeSandbox(async (sandbox) => {
    const client = await sandbox.connect()
    const interpreter = (() => {
      if (language === 'python') return client.interpreters.python
      if (language === 'javascript') return client.interpreters.javascript

      throw new BadRequestError(`Language ${language} is not supported`)
    })()

    const result = await interpreter(code)
    return Result.ok(normalizedResult({ output: result, exitCode: 0 }))
  })
}
