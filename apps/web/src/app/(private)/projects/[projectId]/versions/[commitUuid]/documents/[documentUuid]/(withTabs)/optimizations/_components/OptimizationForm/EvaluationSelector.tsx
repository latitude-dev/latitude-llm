import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useEffect, useMemo } from 'react'

export function EvaluationSelector({
  project,
  commit,
  document,
  value,
  onChange,
  errors,
  disabled,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  value?: string
  onChange: (value?: string) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const { data: evaluations, isLoading } = useEvaluationsV2({
    project,
    commit,
    document,
  })

  const defaultEvaluation = useMemo(() => {
    if (!document.mainEvaluationUuid) return undefined
    return evaluations.find((e) => e.uuid === document.mainEvaluationUuid) as
      | EvaluationV2
      | undefined
  }, [evaluations, document.mainEvaluationUuid])

  useEffect(() => {
    if (value) return
    if (!defaultEvaluation) return
    onChange(defaultEvaluation.uuid)
  }, [value, defaultEvaluation, onChange])

  const options = useMemo(() => {
    return evaluations
      .filter((evaluation) => {
        if (evaluation.deletedAt) return false
        const spec = getEvaluationMetricSpecification(evaluation)
        return spec.supportsBatchEvaluation && !spec.requiresExpectedOutput
      })
      .map((evaluation) => {
        const spec = getEvaluationMetricSpecification(evaluation)

        return {
          icon:
            evaluation.uuid === defaultEvaluation?.uuid ? (
              <Tooltip
                asChild
                delayDuration={750}
                trigger={
                  <div className='w-4 h-auto flex justify-center'>
                    <DotIndicator
                      variant='success'
                      size='md'
                      className='mx-auto'
                    />
                  </div>
                }
              >
                The default Performance Score created and maintained
                automatically by the system. This score combines the evaluations
                that are tracking and monitoring active issues.
              </Tooltip>
            ) : (
              spec.icon
            ),
          value: evaluation.uuid,
          label: evaluation.name,
        }
      })
  }, [evaluations, defaultEvaluation?.uuid])

  return (
    <Select
      value={value ?? ''}
      name='evaluationUuid'
      label='Evaluation'
      description='The evaluation used to steer the optimization algorithm. Only evaluations that do not require an expected output are supported'
      placeholder='Select an evaluation'
      options={options}
      onChange={(val) => onChange(val || undefined)}
      errors={errors?.['evaluationUuid']}
      loading={isLoading}
      disabled={disabled || isLoading}
      required
    />
  )
}
