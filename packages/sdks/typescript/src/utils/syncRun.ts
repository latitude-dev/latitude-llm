import {
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'
import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import {
  HandlerType,
  RunOptions,
  RunSyncAPIResponse,
  SDKOptions,
} from '$sdk/utils/types'

export async function syncRun(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    customIdentifier,
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
    const json = (await response.json()) as ApiErrorJsonResponse
    const error = new LatitudeApiError({
      status: response.status,
      serverResponse: JSON.stringify(json),
      message: json.message,
      errorCode: json.errorCode,
      dbErrorRef: json.dbErrorRef,
    })

    onError?.(error)
    return !onError ? Promise.reject(error) : Promise.resolve()
  }

  const json = (await response.json()) as RunSyncAPIResponse
  onFinished?.(json)
  return Promise.resolve(json)
}
