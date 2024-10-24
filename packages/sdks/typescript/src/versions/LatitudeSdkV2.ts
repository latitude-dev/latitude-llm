import { LatitudeMissingStreamOption } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { HandlerType } from '$sdk/utils/types'
import {
  BaseRunOptions,
  ILatitudeSdk,
  LatitudeSdk,
} from '$sdk/versions/LatitudeSdk'

type RunOptions = BaseRunOptions & { stream: boolean }
export class LatitudeSdkV2 extends LatitudeSdk implements ILatitudeSdk<'v2'> {
  async run(path: string, options: RunOptions) {
    if (typeof options.stream !== 'boolean') {
      return Promise.reject(new LatitudeMissingStreamOption())
    }

    if (options.stream) return this.streamRun(path, options)

    return this.syncRun(path, options)
  }

  protected async syncRun(
    path: string,
    {
      projectId,
      versionUuid,
      parameters,
      customIdentifier,
      onFinished,
      onError,
    }: RunOptions,
  ) {
    projectId = projectId ?? this.projectId

    if (!projectId) {
      const error = new Error('Project ID is required')
      onError?.(error)
      return Promise.reject(error)
    }

    versionUuid = versionUuid ?? this.versionUuid

    try {
      const response = await this.request({
        method: 'POST',
        handler: HandlerType.RunDocument,
        params: { projectId, versionUuid },
        body: {
          stream: false,
          path,
          parameters,
          customIdentifier,
        },
      })

      if (!response.ok) {
        const error = new Error(response.statusText)
        onError?.(error)
        return Promise.reject(error)
      }

      const json = await response.json()
      const body = json as Awaited<ReturnType<typeof handleStream>>
      onFinished?.(body!)

      return Promise.resolve(body)
    } catch (err) {
      onError?.(err as Error)
      return Promise.reject(err)
    }
  }
}
