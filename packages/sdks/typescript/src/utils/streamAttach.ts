import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import {
  AttachRunOptions,
  GenerationResponse,
  HandlerType,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import { AssertedStreamType } from '@latitude-data/constants/ai'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'
import { handleToolCallFactory } from './streamRun'

function handleError(
  error: LatitudeApiError,
  onError?: (error: LatitudeApiError) => void,
): Promise<undefined> | never {
  onError?.(error)
  return !onError ? Promise.reject(error) : Promise.resolve(undefined)
}

export async function streamAttach<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
>(
  uuid: string,
  {
    onEvent,
    onFinished,
    onError,
    tools,
    options,
  }: AttachRunOptions<Tools, S> & {
    options: SDKOptions
  },
): Promise<GenerationResponse<S> | undefined> {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.AttachRun,
      params: { conversationUuid: uuid },
      options: options,
      body: { stream: true },
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: json ? JSON.stringify(json) : response.statusText,
        message: json?.message ?? response.statusText,
        errorCode: json?.errorCode ?? ApiErrorCodes.InternalServerError,
        dbErrorRef: json?.dbErrorRef,
      })

      return handleError(error, onError)
    }

    const finalResponse = await handleStream<S>({
      body: response.body!,
      onEvent,
      onError,
      onToolCall: handleToolCallFactory({ tools, options }),
      signal: options.signal,
    })

    if (!finalResponse) return

    onFinished?.(finalResponse)

    return Promise.resolve(finalResponse)
  } catch (e) {
    if (e instanceof LatitudeApiError) {
      return handleError(e, onError)
    }

    const err = e as Error
    const error = new LatitudeApiError({
      status: 500,
      message: err.message,
      serverResponse: err.message,
      errorCode: ApiErrorCodes.InternalServerError,
    })

    return handleError(error, onError)
  }
}
