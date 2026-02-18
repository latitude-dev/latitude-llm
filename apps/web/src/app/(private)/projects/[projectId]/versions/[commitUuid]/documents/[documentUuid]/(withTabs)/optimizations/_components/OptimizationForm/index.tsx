import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  OPTIMIZATION_MAX_ROWS,
  OPTIMIZATION_MAX_TIME,
  OPTIMIZATION_MAX_TOKENS,
  OptimizationConfiguration,
} from '@latitude-data/constants'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { StandardSchemaV1 } from '@standard-schema/spec'
import merge from 'lodash-es/merge'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BudgetSelector } from './BudgetSelector'
import { DatasetSelector } from './DatasetSelector'
import { EvaluationSelector } from './EvaluationSelector'
import { ParametersConfiguration } from './ParametersConfiguration'
import {
  OPTIMIZATION_PRESETS,
  PresetSelector,
  type OptimizationPresetKey,
} from './PresetSelector'
import { ScopeSelector } from './ScopeSelector'
import { SimulationSettingsSection } from './SimulationSettings'

export type OptimizationFormErrors = ActionErrors<
  StandardSchemaV1<{
    evaluationUuid: string
    datasetId: string
    configuration: string
  }>
>

export function parseActionErrors(errors?: OptimizationFormErrors) {
  if (!errors) return {}
  return errors.fieldErrors
}

export function OptimizationForm({
  evaluationUuid,
  setEvaluationUuid,
  datasetId,
  setDatasetId,
  configuration,
  setConfiguration,
  errors: actionErrors,
  disabled,
}: {
  evaluationUuid?: string
  setEvaluationUuid: (evaluationUuid?: string) => void
  datasetId?: number
  setDatasetId: (datasetId?: number) => void
  configuration: OptimizationConfiguration
  setConfiguration: (configuration: OptimizationConfiguration) => void
  errors?: OptimizationFormErrors
  disabled?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [expanded, setExpanded] = useState(false)
  const errors = useMemo(() => parseActionErrors(actionErrors), [actionErrors])

  const { metadata, updateMetadata } = useMetadata()
  const { data: providers } = useProviderApiKeys()

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

  const { provider, model } = useMemo(() => {
    const providerName = metadata?.config?.provider as string | undefined
    const model = metadata?.config?.model as string | undefined
    const matched = providers?.find((p) => p.name === providerName)
    return { provider: matched?.provider, model: model }
  }, [metadata?.config, providers])

  const currentPreset = useMemo((): OptimizationPresetKey | 'custom' => {
    const presetKeys = Object.keys(
      OPTIMIZATION_PRESETS,
    ) as OptimizationPresetKey[]
    for (const key of presetKeys) {
      const preset = OPTIMIZATION_PRESETS[key]
      if (presetMatches(configuration, preset.configuration)) return key
    }
    return 'custom'
  }, [configuration])

  const handlePresetChange = useCallback(
    (presetKey: OptimizationPresetKey) => {
      const preset = OPTIMIZATION_PRESETS[presetKey]
      setConfiguration(merge({}, configuration, preset.configuration))
    },
    [configuration, setConfiguration],
  )

  const [requiresExpectedOutput, setRequiresExpectedOutput] = useState(false)
  const [selectedDataset, setSelectedDataset] = useState<Dataset>()
  const { data: datasetRowCount } = useDatasetRowsCount({
    dataset: selectedDataset,
  })

  const effectiveRowCount = useMemo(() => {
    if (datasetId != null && datasetRowCount != null) {
      return Math.min(datasetRowCount, OPTIMIZATION_MAX_ROWS)
    }
    return configuration.dataset?.target ?? OPTIMIZATION_MAX_ROWS
  }, [datasetId, datasetRowCount, configuration.dataset?.target])

  const showBudgetWarning = useMemo(() => {
    const time = configuration.budget?.time ?? 0
    const tokens = configuration.budget?.tokens ?? 0
    const t = effectiveRowCount / OPTIMIZATION_MAX_ROWS
    const factor = (t * t) / (t * t + (1 - t) * (1 - t))
    return (
      (time > 0 && time < OPTIMIZATION_MAX_TIME * factor) ||
      (tokens > 0 && tokens < OPTIMIZATION_MAX_TOKENS * factor)
    )
  }, [configuration.budget, effectiveRowCount])

  const showDatasetWarning = useMemo(() => {
    return (
      requiresExpectedOutput && (!datasetId || !configuration.dataset?.label)
    )
  }, [requiresExpectedOutput, datasetId, configuration.dataset?.label])

  return (
    <form className='min-w-0' id='optimizationForm'>
      <FormWrapper>
        <PresetSelector
          value={currentPreset}
          onChange={handlePresetChange}
          disabled={disabled}
        />
        {showBudgetWarning && (
          <Alert
            variant='warning'
            title='Optimization budget is low'
            description='If your original prompt or evaluation takes too much time or tokens, the optimization system may not be able to propose even a single candidate'
          />
        )}
        <EvaluationSelector
          project={project}
          commit={commit}
          document={document}
          value={evaluationUuid}
          onChange={setEvaluationUuid}
          onRequiresExpectedOutputChange={setRequiresExpectedOutput}
          errors={errors}
          disabled={disabled}
        />
        {showDatasetWarning && (
          <Alert
            variant='warning'
            title='This evaluation requires an expected output'
            description='A labeled dataset must be configured for the optimization to run'
          />
        )}
        <CollapsibleBox
          title='Advanced configuration'
          icon='settings'
          isExpanded={expanded}
          onToggle={setExpanded}
          scrollable={false}
          expandedContent={
            <FormWrapper>
              <DatasetSelector
                datasetId={datasetId}
                onDatasetChange={(dataset) => {
                  setDatasetId(dataset?.id)
                  setSelectedDataset(dataset)
                }}
                target={configuration.dataset?.target}
                onTargetChange={(value) =>
                  setConfiguration({
                    ...configuration,
                    dataset: { ...configuration.dataset, target: value },
                  })
                }
                label={configuration.dataset?.label}
                onLabelChange={(value) =>
                  setConfiguration({
                    ...configuration,
                    dataset: { ...configuration.dataset, label: value },
                  })
                }
                requiresExpectedOutput={requiresExpectedOutput}
                errors={errors}
                disabled={disabled}
              />
              {parameters.length > 0 && (
                <ParametersConfiguration
                  parameters={parameters}
                  metadata={metadata?.config?.parameters as any}
                  datasetId={datasetId}
                  parametersConfig={configuration.parameters}
                  onParametersChange={(value) =>
                    setConfiguration({ ...configuration, parameters: value })
                  }
                  errors={errors}
                  disabled={disabled}
                />
              )}
              <SimulationSettingsSection
                value={configuration.simulation}
                onChange={(value) =>
                  setConfiguration({ ...configuration, simulation: value })
                }
                errors={errors}
                disabled={disabled}
              />
              <ScopeSelector
                value={configuration.scope}
                onChange={(value) =>
                  setConfiguration({ ...configuration, scope: value })
                }
                errors={errors}
                disabled={disabled}
              />
              <BudgetSelector
                value={configuration.budget}
                onChange={(value) =>
                  setConfiguration({ ...configuration, budget: value })
                }
                provider={provider}
                model={model}
                errors={errors}
                disabled={disabled}
              />
            </FormWrapper>
          }
        />
      </FormWrapper>
    </form>
  )
}

function presetMatches(
  configuration: Record<string, unknown>,
  preset: Record<string, unknown>,
): boolean {
  for (const [key, presetValue] of Object.entries(preset)) {
    const configValue = configuration[key]
    if (
      typeof presetValue === 'object' &&
      presetValue !== null &&
      typeof configValue === 'object' &&
      configValue !== null
    ) {
      if (
        !presetMatches(
          configValue as Record<string, unknown>,
          presetValue as Record<string, unknown>,
        )
      ) {
        return false
      }
    } else if (configValue !== presetValue) {
      return false
    }
  }
  return true
}
