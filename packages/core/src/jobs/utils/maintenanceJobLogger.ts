import type { Job } from 'bullmq'
import { JobLogger, createLogReader as createGenericLogReader } from './jobLogger'

const NAMESPACE = 'maintenance:job'

export class MaintenanceJobLogger extends JobLogger {
  constructor(job: Job) {
    super({ namespace: NAMESPACE, jobId: job.id!, job })
  }
}

export function createLogReader(jobId: string) {
  return createGenericLogReader({ namespace: NAMESPACE, jobId })
}
