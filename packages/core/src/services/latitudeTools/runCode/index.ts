import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import { CodeToolArgs } from './types'
import { runCodeWithDependencies } from './withDependencies'
import { runCodeWithoutDependencies } from './withoutDependencies'

function assertContainsPrintStatement({ code, language }: CodeToolArgs) {
  const printStatementResult = (() => {
    if (language === 'python') return Result.ok('print(')
    if (language === 'javascript') return Result.ok('console.log(')

    return Result.error(
      new BadRequestError(`Unsupported language: ${language}`),
    )
  })()

  if (!Result.isOk(printStatementResult)) return printStatementResult
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

async function runCode({
  code,
  language,
  dependencies,
}: CodeToolArgs): PromisedResult<string, LatitudeError> {
  const assertResult = assertContainsPrintStatement({ code, language })
  if (!Result.isOk(assertResult)) return assertResult

  const runFn = dependencies?.length
    ? runCodeWithDependencies
    : runCodeWithoutDependencies

  const runResult = await runFn({ code, language, dependencies })
  if (!Result.isOk(runResult)) return runResult

  const { output, exitCode } = runResult.unwrap()

  if (exitCode !== 0) {
    return Result.error(new LatitudeError(output))
  }

  return Result.ok(output)
}

export default {
  name: LatitudeTool.RunCode,
  internalName: LatitudeToolInternalName.RunCode,
  method: runCode,
  definition: (context: TelemetryContext) => ({
    description:
      'Runs a custom script, and returns the output text.\n' +
      'This code will be executed in a sandboxed environment, so it cannot have access to other or previous runs.\n' +
      'In order to obtain results, the code must include an output statement (e.g. `print(…)` in Python, `console.log(…)` in JavaScript).\n' +
      'The executed code will be timed out after 60 seconds. This means that the code must finish execution within 60 seconds, or it will be stopped, which makes it not suitable for long-running scripts or server-side code.\n' +
      'No environment variables are available: All necessary configurations must be provided in the code itself.',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description:
            'The language of the script. Either "python" or "javascript" (node).',
        },
        code: {
          type: 'string',
          description:
            'The code to run. The code must include at least one output statement, such as `print(…)` in Python or `console.log(…)` in JavaScript.',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'An optional list of all the required dependencies to run the script. Adding dependencies will severely increase the execution time, so do not include them unless required.',
        },
      },
      required: ['language', 'code'],
      additionalProperties: false,
    },
    execute: async (args: CodeToolArgs, toolCall) =>
      withTelemetryWrapper(runCode, {
        toolName: LatitudeTool.RunCode,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition
