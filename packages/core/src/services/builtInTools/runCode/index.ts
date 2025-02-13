import {
  LatitudeError,
  BadRequestError,
  PromisedResult,
  Result,
} from '../../../lib'
import { CodeToolArgs } from './types'
import { runCodeWithoutDependencies } from './withoutDependencies'
import { runCodeWithDependencies } from './withDependencies'

function assertContainsPrintStatement({ code, language }: CodeToolArgs) {
  const printStatementResult = (() => {
    if (language === 'python') return Result.ok('print(')
    if (language === 'javascript') return Result.ok('console.log(')

    return Result.error(
      new BadRequestError(`Unsupported language: ${language}`),
    )
  })()

  if (printStatementResult.error) return printStatementResult
  const printStatement = printStatementResult.value

  if (!code.includes(printStatement)) {
    return Result.error(
      new BadRequestError(
        `${language} code must include a \`${printStatement}...)\` statement`,
      ),
    )
  }

  return Result.nil()
}

export async function runCode({
  code,
  language,
  dependencies,
}: CodeToolArgs): PromisedResult<string, LatitudeError> {
  const assertResult = assertContainsPrintStatement({ code, language })
  if (assertResult.error) return assertResult

  const runFn = dependencies?.length
    ? runCodeWithDependencies
    : runCodeWithoutDependencies

  const runResult = await runFn({ code, language, dependencies })
  if (runResult.error) return runResult

  const { output, exitCode } = runResult.unwrap()

  if (exitCode !== 0) {
    return Result.error(new LatitudeError(output))
  }

  return Result.ok(output)
}
