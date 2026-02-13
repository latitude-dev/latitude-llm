import type { Job } from 'bullmq'
import { RedisStream } from '../../lib/redisStream'

type LogLevel = 'info' | 'warn' | 'error' | 'done'

type LogEntry = {
  timestamp: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_TTL = 600 // 10 minutes
const DEFAULT_CAP = 5000

function streamKey(namespace: string, jobId: string) {
  return `${namespace}:${jobId}:logs`
}

export class JobLogger {
  private stream: RedisStream
  private job?: Job

  constructor({
    namespace,
    jobId,
    job,
    cap = DEFAULT_CAP,
    ttl = DEFAULT_TTL,
  }: {
    namespace: string
    jobId: string
    job?: Job
    cap?: number
    ttl?: number
  }) {
    this.job = job
    this.stream = new RedisStream({
      key: streamKey(namespace, jobId),
      cap,
      ttl,
    })
  }

  async info(message: string, data?: Record<string, unknown>) {
    await this.write('info', message, data)
  }

  async warn(message: string, data?: Record<string, unknown>) {
    await this.write('warn', message, data)
  }

  async error(message: string, data?: Record<string, unknown>) {
    await this.write('error', message, data)
  }

  async done(message = 'Job completed') {
    await this.write('done', message)
    await this.stream.cleanup(60)
    await this.stream.close()
  }

  private async write(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    }
    await this.stream.write(entry)

    if (this.job) {
      const line = data
        ? `[${level}] ${message} ${JSON.stringify(data)}`
        : `[${level}] ${message}`
      await this.job.log(line)
    }
  }
}

export function createLogReader({
  namespace,
  jobId,
  cap = DEFAULT_CAP,
  ttl = DEFAULT_TTL,
}: {
  namespace: string
  jobId: string
  cap?: number
  ttl?: number
}) {
  return new RedisStream({
    key: streamKey(namespace, jobId),
    cap,
    ttl,
  })
}
