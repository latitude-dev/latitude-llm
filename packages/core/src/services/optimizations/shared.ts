import { OptimizationConfiguration } from '../../constants'
import { AbortedError } from '../../lib/errors'

export function raiseForAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw new AbortedError()
  }
}

// BONUS(AO/OPT): Generate fake data for the parameter
export function maskParameter({
  parameter,
}: {
  parameter: string
  value: unknown
  configuration: OptimizationConfiguration
}) {
  return `{{${parameter}}} (REDACTED)`
}
