import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import { waitForTools } from '$sdk/utils/streamRun'
import {
  GenerationResponse,
  HandlerType,
  RunPromptOptions,
  RunSyncAPIResponse,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import { AssertedStreamType } from '@latitude-data/constants'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'

export async function syncRun<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
>(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    tools,
    customIdentifier,
    userMessage,
    messages,
    mcpHeaders,
    onFinished,
    onError,
    options,
  }: RunPromptOptions<Tools, S, false> & {
    options: SDKOptions
  },
): Promise<GenerationResponse<S> | undefined> {
  projectId = projectId ?? options.projectId

  if (!projectId) {
    const error = new LatitudeApiError({
      status: 404,
      message: 'Project ID is required',
      serverResponse: 'Project ID is required',
      errorCode: LatitudeErrorCodes.NotFoundError,
    })

    onError?.(error)
    return Promise.reject(error)
  }

  versionUuid = versionUuid ?? options.versionUuid

  const response = await makeRequest({
    method: 'POST',
    handler: HandlerType.RunDocument,
    params: { projectId, versionUuid },
    options,
    body: {
      stream: false,
      background: false,
      path,
      parameters,
      customIdentifier,
      tools: waitForTools(tools),
      userMessage,
      messages,
      mcpHeaders,
    },
  })

  if (!response.ok) {
    let json: ApiErrorJsonResponse | undefined
    try {
      json = (await response.json()) as ApiErrorJsonResponse
    } catch (_error) {
      // Do nothing, sometimes gateway returns html instead of json (502/504 errors)
    }

    const error = new LatitudeApiError({
      status: response.status,
      serverResponse: json ? JSON.stringify(json) : response.statusText,
      message: json?.message ?? response.statusText,
      errorCode: json?.errorCode ?? ApiErrorCodes.InternalServerError,
      dbErrorRef: json?.dbErrorRef,
    })

    onError?.(error)
    return !onError ? Promise.reject(error) : Promise.resolve(undefined)
  }

  const finalResponse = (await response.json()) as RunSyncAPIResponse<S>

  onFinished?.(finalResponse)

  return Promise.resolve(finalResponse)
}
