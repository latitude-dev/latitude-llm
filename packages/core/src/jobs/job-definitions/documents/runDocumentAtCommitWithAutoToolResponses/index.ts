import { LogSources } from '@latitude-data/constants'
import { Experiment } from '../../../../browser'
import { TelemetryContext } from '../../../../telemetry'
import { getCopilotDataForGenerateToolResponses } from './getCopilotData'
import {
  getDataForInitialRequest,
  GetDataParams,
} from './getDataForInitialRequest'
import { runDocumentUntilItStops } from './runDocumentUntilItStops'

/**
 * This function handle the processing of a document even when
 * it has tool calls in it. If one or more tool calls are detected
 * we generate a response with AI so the chain can be finished.
 *
 * WARNING: This is for internal use inside Latitude app. Do not
 * use for users' requests from the API gateway.
 */
export async function runDocumentAtCommitWithAutoToolResponses({
  context,
  parameters,
  customPrompt,
  source,
  autoRespondToolCalls,
  experiment,
  ...dataParams
}: GetDataParams & {
  context: TelemetryContext
  parameters: Record<string, unknown>
  customPrompt?: string
  experiment?: Experiment
  source: LogSources
  autoRespondToolCalls: boolean
}) {
  const copilotResult = await getCopilotDataForGenerateToolResponses()
  if (copilotResult.error) return copilotResult

  const dataResult = await getDataForInitialRequest(dataParams)
  if (dataResult.error) return dataResult

  const { workspace, document, commit } = dataResult.value

  return await runDocumentUntilItStops(
    {
      hasToolCalls: false,
      autoRespondToolCalls,
      data: {
        context,
        workspace,
        commit,
        document,
        customPrompt,
        parameters,
        source,
        experiment,
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
