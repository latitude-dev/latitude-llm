import {
  ChainStepObjectResponse,
  ChainStepTextResponse,
  LogSources,
} from '../../browser'
import { Result } from '../../lib/Result'
import { runDocumentAtCommit } from '../commits/runDocumentAtCommit'
import { Copilot } from './shared'

export async function runCopilot({
  copilot,
  parameters = {},
}: {
  copilot: Copilot
  parameters: Record<string, unknown>
}) {
  const result = await runDocumentAtCommit({
    workspace: copilot.workspace,
    commit: copilot.commit,
    document: copilot.document,
    parameters: parameters,
    source: LogSources.API,
  }).then((r) => r.unwrap())

  const error = await result.error
  if (error) throw error

  const response = (await result.lastResponse)!

  return Result.ok(
    (response as ChainStepObjectResponse).object ||
      (response as ChainStepTextResponse).text,
  )
}
