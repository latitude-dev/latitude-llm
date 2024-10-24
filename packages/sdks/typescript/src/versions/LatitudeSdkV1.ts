import {
  BaseRunOptions,
  ILatitudeSdk,
  LatitudeSdk,
} from '$sdk/versions/LatitudeSdk'

export class LatitudeSdkV1 extends LatitudeSdk implements ILatitudeSdk<'v1'> {
  async run(path: string, options: BaseRunOptions = {}) {
    console.log('LatitudeSdkV1.run', path, options)

    return this.streamRun(path, options)
  }
}
