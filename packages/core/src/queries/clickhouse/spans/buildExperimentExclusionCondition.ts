export function buildExperimentExclusionCondition(
  optimizationExperimentUuids: string[],
  params: Record<string, unknown>,
) {
  const conditions = [
    `source != {experimentSource: String}`,
    `experiment_uuid IS NULL`,
  ]

  if (optimizationExperimentUuids.length > 0) {
    params.optimizationExperimentUuids = optimizationExperimentUuids
    conditions.push(
      `experiment_uuid NOT IN ({optimizationExperimentUuids: Array(UUID)})`,
    )
  }

  return `(${conditions.join(' OR ')})`
}
