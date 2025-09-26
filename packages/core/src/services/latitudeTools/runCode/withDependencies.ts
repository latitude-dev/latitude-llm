import { BadRequestError, LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { normalizedResult, withSafeSandbox } from './sandbox'
import { CodeRunResult, CodeToolArgs, SupportedLanguage } from './types'

function getDependencyBuilder({ language }: { language: SupportedLanguage }) {
  if (language === 'python') return (dep: string) => `pip install ${dep}`
  if (language === 'javascript') return (dep: string) => `npm install ${dep}`

  throw new BadRequestError(`Unsupported language: ${language}`)
}

function getFilename({ language }: { language: SupportedLanguage }) {
  if (language === 'python') return 'index.py'
  if (language === 'javascript') return 'index.js'
  throw new BadRequestError(`Unsupported language: ${language}`)
}

function getRunCommand({
  language,
  filename,
}: {
  language: SupportedLanguage
  filename: string
}) {
  if (language === 'python') return `python ${filename}`
  if (language === 'javascript') return `node ${filename}`
  throw new Error(`Unsupported language: ${language}`)
}

export async function runCodeWithDependencies({
  code,
  language,
  dependencies,
}: CodeToolArgs): PromisedResult<CodeRunResult, LatitudeError> {
  return withSafeSandbox(async (sandbox) => {
    const client = await sandbox.connect()
    const filename = getFilename({ language })
    const buildDependency = getDependencyBuilder({ language })

    await client.fs.writeFile(filename, new TextEncoder().encode(code))

    for await (const dep of dependencies!) {
      const installResult = await client.commands.run(buildDependency(dep))
      if (!installResult) {
        return Result.error(
          new BadRequestError(`Failed to install dependency: '${dep}'`),
        )
      }
    }

    const scriptResult = await client.commands.run(
      getRunCommand({ language, filename }),
    )
    return Result.ok(normalizedResult({ output: scriptResult, exitCode: 0 }))
  })
}
