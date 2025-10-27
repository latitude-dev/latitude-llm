'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataItem } from '$/components/MetadataItem'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  CompositeEvaluationCustomConfiguration,
  CompositeEvaluationCustomSpecification,
  CompositeEvaluationMetric,
  EvaluationType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useCallback, useMemo } from 'react'
import {
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
  ResultPanelProps,
} from '../index'

const specification = CompositeEvaluationCustomSpecification
export default {
  ...specification,
  icon: 'code' as IconName,
  ConfigurationSimpleForm: ConfigurationSimpleForm,
  ResultBadge: ResultBadge,
  ResultPanelMetadata: ResultPanelMetadata,
  chartConfiguration: chartConfiguration,
}

function useDisplayableFormula({
  configuration,
  setConfiguration,
}: {
  configuration?: CompositeEvaluationCustomConfiguration
  setConfiguration?: (
    configuration: CompositeEvaluationCustomConfiguration,
  ) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations, isLoading } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
  })

  const toDisplayableFormula = useMemo(() => {
    if (!configuration?.formula) return ''

    let formula = configuration.formula
    for (const evaluation of evaluations) {
      formula = formula.replaceAll(evaluation.uuid, evaluation.name)
    }

    return formula
  }, [configuration?.formula, evaluations])

  const fromDisplayableFormula = useCallback(
    (formula: string) => {
      if (!configuration || !setConfiguration) return

      for (const evaluation of evaluations) {
        formula = formula.replaceAll(evaluation.name, evaluation.uuid)
      }

      setConfiguration({ ...configuration, formula })
    },
    [evaluations, configuration, setConfiguration],
  )

  return { toDisplayableFormula, fromDisplayableFormula, isLoading }
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  const { toDisplayableFormula, fromDisplayableFormula, isLoading } =
    useDisplayableFormula({ configuration, setConfiguration })

  return (
    <>
      <Input
        value={toDisplayableFormula ?? ''}
        name='formula'
        label='Score formula'
        description="The custom formula to combine the scores with. Use EVAL('name') to reference the result of a sub-evaluation and RESULTS() to reference the total number of results"
        placeholder='(EVAL("A") + EVAL("B") * 2) / RESULTS()'
        onChange={(e) => fromDisplayableFormula(e.target.value)}
        errors={errors?.['formula']}
        className='w-full'
        loading={isLoading}
        disabled={disabled || isLoading}
        required
      />
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  return <>{result.score!.toFixed(0)}% met</>
}

function ResultPanelMetadata({
  result,
}: ResultPanelProps<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  const { toDisplayableFormula, isLoading } = useDisplayableFormula({
    configuration: result.metadata?.configuration,
  })

  return (
    <>
      {!result.error && (
        <>
          <MetadataItem label='Score formula' stacked>
            <div className='w-full pt-2'>
              <TextArea
                value={toDisplayableFormula}
                minRows={1}
                maxRows={6}
                loading={isLoading}
                disabled={true}
              />
            </div>
          </MetadataItem>
        </>
      )}
    </>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Custom
>) {
  return {
    min: 0,
    max: 100,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${point.toFixed(0)}%` : `${point.toFixed(0)}% met`,
  }
}
