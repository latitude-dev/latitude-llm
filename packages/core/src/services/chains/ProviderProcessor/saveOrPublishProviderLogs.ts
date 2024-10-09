import { StreamType } from '../../../constants'
import { AIProviderCallCompletedData } from '../../../events/events'
import { publisher } from '../../../events/publisher'
import { setupJobs } from '../../../jobs'
import { createProviderLog } from '../../providerLogs'
import { StreamConsumeReturn } from '../ChainStreamConsumer/consumeStream'
import { type ObjectProviderLogsData } from './processStreamObject'
import { type TextProviderLogsData } from './processStreamText'

export type LogData<T extends StreamType> = T extends 'text'
  ? Awaited<TextProviderLogsData>
  : T extends 'object'
    ? Awaited<ObjectProviderLogsData>
    : unknown

export async function saveOrPublishProviderLogs<T extends StreamType>({
  data,
  streamType,
  saveSyncProviderLogs,
  finishReason,
}: {
  streamType: T
  data: LogData<T>
  saveSyncProviderLogs: boolean
  finishReason: StreamConsumeReturn['finishReason']
}) {
  publisher.publishLater({
    type: 'aiProviderCallCompleted',
    data: { ...data, streamType } as AIProviderCallCompletedData<T>,
  })

  const providerLogsData = {
    ...data,
    finishReason,
  }

  if (saveSyncProviderLogs) {
    const providerLog = await createProviderLog(providerLogsData).then((r) =>
      r.unwrap(),
    )
    return providerLog
  }

  const queues = await setupJobs()
  queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
    ...providerLogsData,
    generatedAt: data.generatedAt.toISOString(),
  })
}
