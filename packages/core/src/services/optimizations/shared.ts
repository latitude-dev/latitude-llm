import { OptimizationConfiguration } from '../../constants'

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
