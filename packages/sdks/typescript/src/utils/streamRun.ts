import { Readable } from 'stream'

import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'
import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import {
  HandlerType,
  RunPromptOptions,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import { handleToolRequests, hasToolRequests } from '$sdk/utils/toolHelpers'
import { streamChat } from '$sdk/utils/streamChat'

export async function streamRun<Tools extends ToolSpec>(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    stream = false,
    tools,
    customIdentifier,
    onEvent,
    onFinished,
    onError,
    options,
  }: RunPromptOptions<Tools> & {
    options: SDKOptions
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

  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.RunDocument,
      params: { projectId, versionUuid },
      options,
      body: {
        stream,
        path,
        parameters,
        customIdentifier,
      },
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: response.statusText,
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })
      onError?.(error)
      return
    }

    const finalResponse = await handleStream({
      body: response.body! as Readable,
      onEvent,
      onError,
    })

    if (hasToolRequests({ response: finalResponse, tools })) {
      return handleToolRequests<Tools, false>({
        originalResponse: finalResponse,
        messages: finalResponse.conversation,
        onEvent,
        onFinished,
        onError,
        chatFn: streamChat,
        tools,
        options,
      })
    }

    onFinished?.(finalResponse)
    return finalResponse
  } catch (e) {
    const err = e as Error
    const error = new LatitudeApiError({
      status: 500,
      message: err.message,
      serverResponse: err.message,
      errorCode: ApiErrorCodes.InternalServerError,
    })
    onError?.(error)
    return
  }
}
