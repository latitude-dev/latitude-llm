import { LatitudeApiError } from '$sdk/utils/errors'
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

export async function syncChat<Tools extends ToolSpec>(
  uuid: string,
  {
    messages,
    onFinished,
    onError,
    tools,
    options,
    instrumentation,
    trace,
  }: ChatOptionsWithSDKOptions<Tools> & {
    instrumentation?: ToolInstrumentation
  },
) {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      options: options,
      body: { messages, stream: false, trace },
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

    const finalResponse = (await response.json()) as ChatSyncAPIResponse

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
        trace: finalResponse.trace,
        instrumentation,
      })
    }

    onFinished?.(finalResponse)
    return Promise.resolve(finalResponse)
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
