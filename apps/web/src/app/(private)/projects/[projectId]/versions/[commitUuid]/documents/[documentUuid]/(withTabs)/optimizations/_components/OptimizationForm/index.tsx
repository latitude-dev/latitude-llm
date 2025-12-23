import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ActionErrors } from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import { OptimizationConfiguration } from '@latitude-data/constants'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { StandardSchemaV1 } from '@standard-schema/spec'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatasetSelector } from './DatasetSelector'
import { EvaluationSelector } from './EvaluationSelector'
import { IterationsSlider } from './IterationsSlider'
import { ParametersConfiguration } from './ParametersConfiguration'
import {
  OPTIMIZATION_PRESETS,
  PresetSelector,
  type OptimizationPresetKey,
} from './PresetSelector'
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

  const currentPreset = useMemo((): OptimizationPresetKey | 'custom' => {
    const presetKeys = Object.keys(
      OPTIMIZATION_PRESETS,
    ) as OptimizationPresetKey[]
    for (const key of presetKeys) {
      const preset = OPTIMIZATION_PRESETS[key]
      const presetConfig = preset.configuration
      let matches = true
      for (const [field, value] of Object.entries(presetConfig)) {
        if ((configuration as Record<string, unknown>)[field] !== value) {
          matches = false
          break
        }
      }
      if (matches) return key
    }
    return 'custom'
  }, [configuration])

  const handlePresetChange = useCallback(
    (presetKey: OptimizationPresetKey) => {
      const preset = OPTIMIZATION_PRESETS[presetKey]
      setConfiguration({
        ...configuration,
        ...preset.configuration,
      })
    },
    [configuration, setConfiguration],
  )

  return (
    <form className='min-w-0' id='optimizationForm'>
      <FormWrapper>
        <PresetSelector
          value={currentPreset}
          onChange={handlePresetChange}
          disabled={disabled}
        />
        <EvaluationSelector
          project={project}
          commit={commit}
          document={document}
          value={evaluationUuid}
          onChange={setEvaluationUuid}
          errors={errors}
          disabled={disabled}
        />
        <CollapsibleBox
          title='Advanced configuration'
          icon='settings'
          isExpanded={expanded}
          onToggle={setExpanded}
          scrollable={false}
          expandedContent={
            <FormWrapper>
              <DatasetSelector
                value={datasetId}
                onChange={setDatasetId}
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
              <IterationsSlider
                value={configuration.iterations}
                onChange={(value) =>
                  setConfiguration({ ...configuration, iterations: value })
                }
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
