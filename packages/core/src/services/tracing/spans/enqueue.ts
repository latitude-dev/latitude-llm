import { ApiKey, Otlp, Workspace } from '../../../browser'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { Result } from '../../../lib/Result'

export async function enqueueSpans(
  _: {
    spans: Otlp.ResourceSpan[]
    apiKey?: ApiKey
    workspace?: Workspace
  },
  __: DiskWrapper = diskFactory('private'),
) {
  // TODO(gerard): Recove this

  return Result.nil()
}
