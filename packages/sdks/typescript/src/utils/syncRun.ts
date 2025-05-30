import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import { syncChat } from '$sdk/utils/syncChat'
import { handleToolRequests, hasTools } from '$sdk/utils/toolHelpers'
import {
  HandlerType,
  RunPromptOptions,
  RunSyncAPIResponse,
  SDKOptions,
  ToolInstrumentation,
  ToolSpec,
} from '$sdk/utils/types'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'

export async function syncRun<Tools extends ToolSpec>(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    customIdentifier,
    onFinished,
    onError,
    tools,
    options,
    instrumentation,
  }: RunPromptOptions<Tools> & {
    options: SDKOptions
    instrumentation?: ToolInstrumentation
  },
) {
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
      path,
      parameters,
      customIdentifier,
    },
  })

  if (!response.ok) {
    let json: ApiErrorJsonResponse | undefined
    try {
      json = (await response.json()) as ApiErrorJsonResponse
    } catch (error) {
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

  const finalResponse = (await response.json()) as RunSyncAPIResponse

  if (hasTools(tools) && finalResponse.toolRequests.length) {
    return handleToolRequests<Tools, false>({
      originalResponse: finalResponse,
      messages: finalResponse.conversation,
      toolRequests: finalResponse.toolRequests,
      onFinished,
      onError,
      chatFn: syncChat,
      tools,
      options,
      // TODO(tracing): get trace context from the response
      instrumentation,
    })
  }

  onFinished?.(finalResponse)
  return Promise.resolve(finalResponse)
}
