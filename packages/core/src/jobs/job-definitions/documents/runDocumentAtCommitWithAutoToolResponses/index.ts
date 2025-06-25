import { LogSources } from '@latitude-data/constants'
import {
  getDataForInitialRequest,
  GetDataParams,
} from './getDataForInitialRequest'
import { getCopilotDataForGenerateToolResponses } from './getCopilotData'
import { Experiment } from '../../../../browser'
import { runDocumentAtCommit } from '../../../../services/commits'

/**
 * This function handle the processing of a document even when
 * it has tool calls in it. If one or more tool calls are detected
 * we generate a response with AI so the chain can be finished.
 *
 * WARNING: This is for internal use inside Latitude app. Do not
 * use for users' requests from the API gateway.
 */
export async function runDocumentAtCommitWithAutoToolResponses({
  parameters,
  customPrompt,
  source,
  experiment,
  ...dataParams
}: GetDataParams & {
  parameters: Record<string, unknown>
  customPrompt?: string
  experiment?: Experiment
  source: LogSources
}) {
  const copilotResult = await getCopilotDataForGenerateToolResponses()
  if (copilotResult.error) return copilotResult

  const dataResult = await getDataForInitialRequest(dataParams)
  if (dataResult.error) return dataResult

  const { workspace, document, commit } = dataResult.value

  // TODO(compiler): review
  return runDocumentAtCommit({
    workspace,
    document,
    parameters,
    commit,
    source,
    customPrompt,
    experiment,
    mockClientToolResults: true,
  })
}

export type RunDocumentAtCommitWithAutoToolResponsesFn =
  typeof runDocumentAtCommitWithAutoToolResponses
