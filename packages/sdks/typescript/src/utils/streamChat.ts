import { Readable } from 'stream'

import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import { handleToolRequests, hasTools } from '$sdk/utils/toolHelpers'
import {
  ChatOptionsWithSDKOptions,
  ChatSyncAPIResponse,
  HandlerType,
  ToolInstrumentation,
  ToolSpec,
} from '$sdk/utils/types'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'

export async function streamChat<Tools extends ToolSpec>(
  uuid: string,
  {
    messages,
    onEvent,
    onFinished,
    onError,
    tools,
    options,
    instrumentation,
    trace,
  }: ChatOptionsWithSDKOptions<Tools> & {
    instrumentation?: ToolInstrumentation
  },
): Promise<ChatSyncAPIResponse | undefined> {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      options: options,
      body: { messages, stream: true, trace },
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(json),
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })

      onError?.(error)
      return !onError ? Promise.reject(error) : Promise.resolve(undefined)
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
        trace: finalResponse.trace,
        instrumentation,
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
    return !onError ? Promise.reject(error) : Promise.resolve(undefined)
  }
}
