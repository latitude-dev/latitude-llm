import { LatitudeMissingStreamOption } from '$sdk/utils/errors'
import { LatitudeSdk } from '$sdk/versions/LatitudeSdk'

type BaseRunArgs = Parameters<LatitudeSdk['run']>
export type V2RunOptions = BaseRunArgs[1] & {
  stream: boolean
}
export class LatitudeSdkV2 extends LatitudeSdk {
  async run(path: string, options: V2RunOptions) {
    if (typeof options.stream !== 'boolean') {
      return Promise.reject(new LatitudeMissingStreamOption())
    }

    if (options.stream) {
      return this.streamRun(path, options)
    }
  }
}
