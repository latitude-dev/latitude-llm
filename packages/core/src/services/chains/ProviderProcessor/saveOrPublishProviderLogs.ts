import { RunErrorCodes, StreamType } from '../../../constants'
import { AIProviderCallCompletedData } from '../../../events/events'
import { publisher } from '../../../events/publisher'
import { setupJobs } from '../../../jobs'
import { TypedResult } from '../../../lib'
import { StreamChunk } from '../../ai'
import { createProviderLog } from '../../providerLogs'
import { ChainError } from '../ChainErrors'
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
}: {
  streamType: T
  data: LogData<T>
  saveSyncProviderLogs: boolean
  // TODO: Use stream result check if contains an AI error to be
  // persisted in the provider log
  streamConsumedResult: TypedResult<
    StreamChunk[],
    ChainError<RunErrorCodes.AIRunError>
  >
}) {
  publisher.publishLater({
    type: 'aiProviderCallCompleted',
    data: { ...data, streamType } as AIProviderCallCompletedData<T>,
  })

  if (saveSyncProviderLogs) {
    const providerLog = await createProviderLog(data).then((r) => r.unwrap())
    return providerLog
  }

  const queues = await setupJobs()
  queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
    ...data,
    generatedAt: data.generatedAt.toISOString(),
  })
}
