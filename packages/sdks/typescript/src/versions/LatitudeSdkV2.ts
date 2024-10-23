import { LatitudeMissingStreamOption } from '$sdk/utils/errors'
import {
  BaseRunOptions,
  ILatitudeSdk,
  LatitudeSdk,
} from '$sdk/versions/LatitudeSdk'

export class LatitudeSdkV2 extends LatitudeSdk implements ILatitudeSdk<'v2'> {
  async run(path: string, options: BaseRunOptions & { stream: boolean }) {
    if (typeof options.stream !== 'boolean') {
      return Promise.reject(new LatitudeMissingStreamOption())
    }

    if (options.stream) {
      return this.streamRun(path, options)
    }
  }
}
