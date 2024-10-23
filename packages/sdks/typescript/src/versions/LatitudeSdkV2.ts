import { Readable } from 'stream'

import { LatitudeMissingStreamOption } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { HandlerType } from '$sdk/utils/types'
import { LatitudeSdk } from '$sdk/versions/LatitudeSdk'

type BaseRunArgs = Parameters<LatitudeSdk['run']>
type RunOptions = BaseRunArgs[1] & {
  stream: boolean
}
export class LatitudeSdkV2 extends LatitudeSdk {
  async run(
    path: string,
    {
      projectId,
      versionUuid,
      customIdentifier,
      parameters,
      stream,
      onEvent,
      onError,
      onFinished,
    }: RunOptions,
  ) {
    if (typeof stream !== 'boolean') {
      return Promise.reject(new LatitudeMissingStreamOption())
    }

    projectId = projectId ?? this.projectId

    if (!projectId) {
      onError?.(new Error('Project ID is required'))
      return
    }

    versionUuid = versionUuid ?? this.versionUuid

    try {
      const response = await this.request({
        method: 'POST',
        handler: HandlerType.RunDocument,
        params: { projectId, versionUuid },
        body: {
          path,
          stream,
          parameters,
          customIdentifier,
        },
      })

      if (!response.ok) {
        onError?.(new Error(response.statusText))
        return
      }

      return handleStream({
        body: response.body! as Readable,
        onEvent,
        onFinished,
        onError,
      })
    } catch (err) {
      onError?.(err as Error)
      return
    }
  }
}
