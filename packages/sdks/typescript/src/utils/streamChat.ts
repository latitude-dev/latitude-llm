import { Readable } from 'stream'

import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import {
  ChatOptionsWithSDKOptions,
  ChatSyncAPIResponse,
  HandlerType,
  ToolSpec,
} from '$sdk/utils/types'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'
import { handleToolCallFactory, waitForTools } from './streamRun'

export async function streamChat<Tools extends ToolSpec>(
  uuid: string,
  {
    messages,
    onEvent,
    onFinished,
    onError,
    tools,
    options,
  }: ChatOptionsWithSDKOptions<Tools>,
): Promise<ChatSyncAPIResponse | undefined> {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      options: options,
      body: { messages, tools: waitForTools(tools), stream: true },
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
      onToolCall: handleToolCallFactory({
        tools,
        options,
      }),
    })

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
