import { Job } from 'bullmq'

import { setupQueues } from '../..'
import { Commit } from '../../../browser'
import { LogSources, messagesSchema } from '../../../constants'

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
  const queues = await setupQueues()

  csv.data.forEach((row) => {
    const messages = JSON.parse(row.record[0]!)
    const response = row.record[1]
    const result = messagesSchema.safeParse(messages)
    if (!result.success) {
      // TODO: notify client of invalid log format
      return
    }

    queues.defaultQueue.jobs.enqueueCreateDocumentLogJob({
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
