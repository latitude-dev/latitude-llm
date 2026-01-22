import { env } from '@latitude-data/env'
import tracer from 'dd-trace'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type JobLogContext = {
  correlationId: string
  jobId?: string
  jobName: string
  queueName: string
  attemptNumber: number
  maxAttempts: number
  workspaceId?: number
  [key: string]: unknown
}

type LogEntry = {
  timestamp: string
  level: LogLevel
  message: string
  service: string
  correlationId: string
  jobId?: string
  jobName: string
  queueName: string
  attemptNumber: number
  maxAttempts: number
  durationMs?: number
  [key: string]: unknown
}

const SERVICE_NAME = 'latitude-llm-workers'

function shouldLog(level: LogLevel): boolean {
  if (env.NODE_ENV === 'test') return false
  return true
}

function formatLogEntry(
  level: LogLevel,
  message: string,
  context: JobLogContext,
  extra?: Record<string, unknown>,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    correlationId: context.correlationId,
    jobId: context.jobId,
    jobName: context.jobName,
    queueName: context.queueName,
    attemptNumber: context.attemptNumber,
    maxAttempts: context.maxAttempts,
    ...extra,
  }
}

function logToSpan(level: LogLevel, entry: LogEntry): void {
  const span = tracer.scope().active()
  if (!span) return

  span.log({
    event: level,
    ...entry,
  })
}

function outputLog(level: LogLevel, entry: LogEntry): void {
  const json = JSON.stringify(entry)
  switch (level) {
    case 'error':
      console.error(json)
      break
    case 'warn':
      console.warn(json)
      break
    default:
      console.log(json)
  }
}

/**
 * Structured logger for BullMQ jobs with correlation ID support.
 * Outputs JSON logs for DataDog ingestion and adds context to DataDog spans.
 */
export class JobLogger {
  private context: JobLogContext
  private startTime: number

  constructor(context: JobLogContext) {
    this.context = context
    this.startTime = Date.now()
  }

  private log(
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ): void {
    if (!shouldLog(level)) return

    const entry = formatLogEntry(level, message, this.context, extra)
    logToSpan(level, entry)
    outputLog(level, entry)
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.log('debug', message, extra)
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.log('info', message, extra)
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.log('warn', message, extra)
  }

  error(message: string, error?: Error, extra?: Record<string, unknown>): void {
    this.log('error', message, {
      ...extra,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })
  }

  /**
   * Returns the elapsed time since the logger was created (job started).
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime
  }

  /**
   * Creates a child logger with additional context.
   */
  child(additionalContext: Record<string, unknown>): JobLogger {
    return new JobLogger({
      ...this.context,
      ...additionalContext,
    } as JobLogContext)
  }

  /**
   * Updates the logger context with additional data.
   */
  addContext(additionalContext: Record<string, unknown>): void {
    Object.assign(this.context, additionalContext)
  }

  /**
   * Gets the current context for external use.
   */
  getContext(): JobLogContext {
    return { ...this.context }
  }
}

/**
 * Creates a JobLogger instance for a BullMQ job.
 */
export function createJobLogger(context: JobLogContext): JobLogger {
  return new JobLogger(context)
}
