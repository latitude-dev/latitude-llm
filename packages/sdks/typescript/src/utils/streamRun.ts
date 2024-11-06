import { Readable } from 'stream'

import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'
import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import { HandlerType, RunOptions, SDKOptions } from '$sdk/utils/types'

export async function streamRun(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    stream = false,
    customIdentifier,
    onEvent,
    onFinished,
    onError,
    options,
  }: RunOptions & {
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

    return handleStream({
      body: response.body! as Readable,
      onEvent,
      onFinished,
      onError,
    })
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
