import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import useDatasets from '$/stores/datasets'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { OptimizationConfiguration } from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { MultiSelectInput } from '@latitude-data/web-ui/molecules/MultiSelectInput'
import { cn } from '@latitude-data/web-ui/utils'
import { StandardSchemaV1 } from '@standard-schema/spec'
import { useEffect, useMemo, useState } from 'react'

// TODO(AO/OPT): Review & implement

export type OptimizationFormErrors = ActionErrors<
  StandardSchemaV1<{
    configuration: string
    goldsetId: string
    evaluationUuid: string
  }>
>

export function parseActionErrors(errors?: OptimizationFormErrors) {
  if (!errors) return {}
  return errors.fieldErrors
}

export type OptimizationLevel = 'quick' | 'balanced' | 'thorough'

type OptimizationLevelOption = {
  value: OptimizationLevel
  title: string
  description: string
  duration: string
  cost: string
}

const OPTIMIZATION_LEVELS: OptimizationLevelOption[] = [
  {
    value: 'quick',
    title: 'Quick',
    description: 'Fast optimization with minimal iterations',
    duration: '~2 min',
    cost: 'Low cost',
  },
  {
    value: 'balanced',
    title: 'Balanced',
    description: 'Balanced optimization with moderate iterations',
    duration: '~5 min',
    cost: 'Medium cost',
  },
  {
    value: 'thorough',
    title: 'Thorough',
    description: 'Deep optimization with many iterations',
    duration: '~15 min',
    cost: 'Higher cost',
  },
]

function OptimizationLevelCard({
  option,
  selected,
  onSelect,
  disabled,
}: {
  option: OptimizationLevelOption
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg border transition-all text-left',
        'hover:border-primary/50 hover:bg-accent/50',
        {
          'border-primary bg-accent': selected,
          'border-border bg-background': !selected,
          'opacity-50 cursor-not-allowed': disabled,
        },
      )}
    >
      <div className='flex items-center justify-between'>
        <Text.H5M color={selected ? 'primary' : 'foreground'}>
          {option.title}
        </Text.H5M>
        {selected && <Icon name='check' color='primary' size='small' />}
      </div>
      <Text.H6 color='foregroundMuted'>{option.description}</Text.H6>
      <div className='flex gap-2 mt-1'>
        <div className='flex items-center gap-1'>
          <Icon name='clock' size='small' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>{option.duration}</Text.H6>
        </div>
        <div className='flex items-center gap-1'>
          <Icon name='coins' size='small' color='foregroundMuted' />
          <Text.H6 color='foregroundMuted'>{option.cost}</Text.H6>
        </div>
      </div>
    </button>
  )
}

function OptimizationLevelSelector({
  value,
  onChange,
  disabled,
  errors,
}: {
  value: OptimizationLevel
  onChange: (value: OptimizationLevel) => void
  disabled?: boolean
  errors?: string[]
}) {
  return (
    <FormFieldGroup
      label='Optimization level'
      description='Choose how thorough the optimization should be'
      layout='vertical'
      errors={errors}
    >
      <div className='grid grid-cols-3 gap-3'>
        {OPTIMIZATION_LEVELS.map((option) => (
          <OptimizationLevelCard
            key={option.value}
            option={option}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
            disabled={disabled}
          />
        ))}
      </div>
    </FormFieldGroup>
  )
}

export function OptimizationForm({
  configuration,
  setConfiguration,
  goldsetId,
  setGoldsetId,
  evaluationUuid,
  setEvaluationUuid,
  errors: actionErrors,
  disabled,
}: {
  configuration: OptimizationConfiguration
  setConfiguration: (configuration: OptimizationConfiguration) => void
  goldsetId: number | undefined
  setGoldsetId: (goldsetId: number | undefined) => void
  evaluationUuid: string | undefined
  setEvaluationUuid: (evaluationUuid: string | undefined) => void
  errors?: OptimizationFormErrors
  disabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [expanded, setExpanded] = useState(false)
  const [optimizationLevel, setOptimizationLevel] =
    useState<OptimizationLevel>('balanced')
  const errors = useMemo(() => parseActionErrors(actionErrors), [actionErrors])

  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({ project, commit, document })

  const evaluationOptions = useMemo(() => {
    return evaluations
      .filter((evaluation) => {
        if (evaluation.deletedAt) return false
        const spec = getEvaluationMetricSpecification(evaluation)
        return spec.supportsBatchEvaluation
      })
      .map((evaluation) => {
        const spec = getEvaluationMetricSpecification(evaluation)
        return {
          icon: spec.icon,
          value: evaluation.uuid,
          label: evaluation.name,
        }
      })
  }, [evaluations])

  const { data: datasets, isLoading: isLoadingDatasets } = useDatasets()

  const datasetOptions = useMemo(() => {
    return (
      datasets?.map((dataset) => ({
        value: String(dataset.id),
        label: dataset.name,
      })) ?? []
    )
  }, [datasets])

  const { metadata, updateMetadata } = useMetadata()

  useEffect(() => {
    updateMetadata({
      promptlVersion: document.promptlVersion,
      prompt: document.content,
      document,
    })
  }, [document, updateMetadata])

  const parameters = useMemo(() => {
    return Array.from(metadata?.parameters ?? [])
  }, [metadata])

  const parameterOptions = useMemo(() => {
    return parameters.map((param) => ({
      value: param,
      label: param,
    }))
  }, [parameters])

  const piiParameters = configuration.parameters
    ? Object.entries(configuration.parameters)
        .filter(([_, config]) => config.isPii)
        .map(([key]) => key)
    : []

  const handlePiiParametersChange = (selectedParams: string[]) => {
    const newParameters: OptimizationConfiguration['parameters'] = {}
    for (const param of parameters) {
      newParameters[param] = {
        isPii: selectedParams.includes(param),
      }
    }
    setConfiguration({ ...configuration, parameters: newParameters })
  }

  return (
    <form className='min-w-0' id='optimizationForm'>
      <FormWrapper>
        <Select
          value={evaluationUuid ?? ''}
          name='evaluationUuid'
          label='Evaluation to optimize for'
          description='The optimization will try to maximize the score of this evaluation'
          placeholder='Select an evaluation'
          options={evaluationOptions}
          onChange={(value) => setEvaluationUuid(value || undefined)}
          errors={errors?.evaluationUuid}
          loading={isLoadingEvaluations}
          disabled={disabled || isLoadingEvaluations}
          required
        />
        <OptimizationLevelSelector
          value={optimizationLevel}
          onChange={setOptimizationLevel}
          disabled={disabled}
        />
        <Select
          value={goldsetId ? String(goldsetId) : undefined}
          name='goldsetId'
          label='Regression testing dataset'
          description='Optional dataset to verify the optimized prompt does not regress on existing quality'
          placeholder='No regression testing'
          options={datasetOptions}
          onChange={(value) => setGoldsetId(value ? Number(value) : undefined)}
          errors={errors?.goldsetId}
          loading={isLoadingDatasets}
          disabled={disabled || isLoadingDatasets}
          removable
        />
        <CollapsibleBox
          title='Advanced configuration'
          icon='settings'
          isExpanded={expanded}
          onToggle={setExpanded}
          scrollable={false}
          expandedContent={
            <FormWrapper>
              <MultiSelectInput
                value={piiParameters}
                name='piiParameters'
                label='PII Parameters'
                description='Mark parameters that contain personally identifiable information. These will be anonymized during optimization.'
                placeholder={
                  parameters.length === 0
                    ? 'No parameters detected'
                    : 'Select PII parameters'
                }
                options={parameterOptions}
                onChange={handlePiiParametersChange}
                loading={metadata === undefined}
                disabled={disabled || parameters.length === 0}
              />
              {metadata !== undefined && parameters.length === 0 && (
                <Text.H6 color='foregroundMuted'>
                  No parameters detected in your prompt. Parameters will appear
                  here once you add them to your prompt.
                </Text.H6>
              )}
            </FormWrapper>
          }
        />
      </FormWrapper>
    </form>
  )
}
