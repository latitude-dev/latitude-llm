import { Readable } from 'stream'

import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import { streamChat } from '$sdk/utils/streamChat'
import { handleToolRequests, hasTools } from '$sdk/utils/toolHelpers'
import {
  HandlerType,
  Instrumentation,
  RunPromptOptions,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'

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
    instrumentation,
  }: RunPromptOptions<Tools> & {
    options: SDKOptions
    instrumentation: Instrumentation
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

    if (hasTools(tools) && finalResponse.toolRequests.length) {
      return handleToolRequests<Tools, false>({
        originalResponse: finalResponse,
        messages: finalResponse.conversation,
        toolRequests: finalResponse.toolRequests,
        onEvent,
        onFinished,
        onError,
        chatFn: streamChat,
        tools,
        options,
        instrumentation,
      })
    }

    onFinished?.(finalResponse)
    return finalResponse
  } catch (e) {
    let error = e as LatitudeApiError

    if (!(e instanceof LatitudeApiError)) {
      const err = e as Error
      error = new LatitudeApiError({
        status: 500,
        message: err.message,
        serverResponse: err.stack ?? '',
        errorCode: ApiErrorCodes.InternalServerError,
      })
    }

    onError?.(error)
    return
  }
}
