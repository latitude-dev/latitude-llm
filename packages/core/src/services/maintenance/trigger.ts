import { Result } from '../../lib/Result'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { queues } from '../../jobs/queues'
import { findJobDefinition } from './registry'

export async function triggerMaintenanceJob({
  jobName,
  params = {},
}: {
  jobName: string
  params?: Record<string, unknown>
}) {
  const definition = findJobDefinition(jobName)
  if (!definition) {
    return Result.error(
      new NotFoundError(`Unknown maintenance job: ${jobName}`),
    )
  }

  for (const param of definition.params) {
    if (param.required && !(param.name in params)) {
      return Result.error(
        new BadRequestError(`Missing required parameter: ${param.name}`),
      )
    }
  }

  const coerced: Record<string, unknown> = {}
  for (const param of definition.params) {
    const value = params[param.name]
    if (value === undefined) continue

    if (param.type === 'number') {
      const num = Number(value)
      if (isNaN(num)) {
        return Result.error(
          new BadRequestError(`Parameter ${param.name} must be a number`),
        )
      }
      coerced[param.name] = num
    } else {
      coerced[param.name] = String(value)
    }
  }

  const { maintenanceQueue } = await queues()
  const job = await maintenanceQueue.add(jobName, coerced, { attempts: 1 })

  return Result.ok({
    jobId: job.id!,
    jobName,
    hasLogs: definition.hasLogs,
  })
}
