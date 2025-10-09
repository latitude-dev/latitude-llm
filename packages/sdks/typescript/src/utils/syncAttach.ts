import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import {
  AttachRunOptions,
  GenerationResponse,
  HandlerType,
  RunSyncAPIResponse,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import { AssertedStreamType } from '@latitude-data/constants'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'

export async function syncAttach<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
>(
  uuid: string,
  {
    onFinished,
    onError,
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
      body: { stream: false },
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

      onError?.(error)
      return !onError ? Promise.reject(error) : Promise.resolve(undefined)
    }

    const finalResponse = (await response.json()) as RunSyncAPIResponse<S>

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
