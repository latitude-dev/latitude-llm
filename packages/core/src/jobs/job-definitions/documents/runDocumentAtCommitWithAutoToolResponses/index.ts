import { LogSources } from '@latitude-data/constants'
import {
  getDataForInitialRequest,
  GetDataParams,
} from './getDataForInitialRequest'
import { runDocumentUntilItStops } from './runDocumentUntilItStops'
import { getCopilotDataForGenerateToolResponses } from './getCopilotData'

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
  source,
  ...dataParams
}: GetDataParams & {
  parameters: Record<string, unknown>
  source: LogSources
}) {
  const copilotResult = await getCopilotDataForGenerateToolResponses()
  if (copilotResult.error) return copilotResult

  const dataResult = await getDataForInitialRequest(dataParams)
  if (dataResult.error) return dataResult

  const { workspace, document, commit } = dataResult.value

  return await runDocumentUntilItStops(
    {
      hasToolCalls: false,
      data: {
        workspace,
        commit,
        document,
        parameters,
        source,
        copilot: copilotResult.value,
      },
    },
    // This is a recursive function, it call itself. To properly test
    // that the mocked version is called we need to pass the function
    // by reference.
    runDocumentUntilItStops,
  )
}

export type RunDocumentAtCommitWithAutoToolResponsesFn =
  typeof runDocumentAtCommitWithAutoToolResponses
