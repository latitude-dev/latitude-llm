import { Job } from 'bullmq'

import { Commit } from '../../../schema/types'
import { LogSources, messagesSchema } from '../../../constants'
import { queues } from '../../queues'

export type UploadDocumentLogsJobData = {
  workspaceId: number
  documentUuid: string
  commit: Commit
  source: LogSources
  csv: { data: { record: string[] }[] }
}

export const uploadDocumentLogsJob = async (
  job: Job<UploadDocumentLogsJobData>,
) => {
  const { workspaceId, source, documentUuid, commit, csv } = job.data
  const { defaultQueue } = await queues()

  csv.data.forEach((row) => {
    const messages = JSON.parse(row.record[0]!)
    const response = row.record[1]
    const result = messagesSchema.safeParse(messages)
    if (!result.success) {
      // TODO: notify client of invalid log format
      return
    }

    defaultQueue.add('createDocumentLogJob', {
      workspaceId,
      documentUuid,
      commit,
      source,
      messages: response ? messages : messages.slice(0, -1),
      responseText:
        response ??
        (messages[messages.length - 1].content?.text ||
          messages[messages.length - 1].content),
    })
  })
}
