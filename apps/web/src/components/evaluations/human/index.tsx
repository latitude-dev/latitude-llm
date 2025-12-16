import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  HumanEvaluationSpecification,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { useEffect, useMemo } from 'react'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  EvaluationMetricFrontendSpecification,
  ResultBadgeProps,
} from '../index'
import HumanEvaluationBinarySpecification from './Binary'
import HumanEvaluationRatingSpecification from './Rating'

// prettier-ignore
const METRICS: {
  [M in HumanEvaluationMetric]: EvaluationMetricFrontendSpecification<EvaluationType.Human, M>
} = {
  [HumanEvaluationMetric.Binary]: HumanEvaluationBinarySpecification,
  [HumanEvaluationMetric.Rating]: HumanEvaluationRatingSpecification,
}

const specification = HumanEvaluationSpecification
export default {
  ...specification,
  icon: 'userRound' as IconName,
  ConfigurationSimpleForm,
  ConfigurationAdvancedForm,
  ResultBadge,
  AnnotationForm,
  chartConfiguration,
  metrics: METRICS,
}

function ConfigurationSimpleForm<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: ConfigurationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.ConfigurationSimpleForm && (
        <metricSpecification.ConfigurationSimpleForm {...rest} />
      )}
    </>
  )
}

function ConfigurationAdvancedForm<M extends HumanEvaluationMetric>({
  metric,
  mode,
  uuid,
  configuration,
  setConfiguration,
  errors,
  disabled,
  ...rest
}: ConfigurationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({ project, commit, document })
  const defaultControls = useMemo(
    () =>
      !isLoadingEvaluations &&
      evaluations
        .filter((e) => e.uuid !== uuid && e.type === EvaluationType.Human)
        .every(
          (e) =>
            !(e as EvaluationV2<EvaluationType.Human>).configuration
              .enableControls,
        ),
    [isLoadingEvaluations, uuid, evaluations],
  )

  useEffect(() => {
    if (mode !== 'create') return
    if (isLoadingEvaluations) return
    // FIXME: use proper callback setState so that you don't depend on options
    // in the useEffect hook
    setConfiguration(
      Object.assign(configuration, { enableControls: defaultControls }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isLoadingEvaluations, defaultControls])

  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <SwitchInput
        checked={configuration.enableControls ?? false}
        name='enableControls'
        label='Annotation controls'
        description='Annotate responses directly in the dashboard using this evaluation'
        onCheckedChange={(value) =>
          setConfiguration({ ...configuration, enableControls: value })
        }
        errors={errors?.['enableControls']}
        disabled={disabled}
        required
      />
      <TextArea
        value={configuration.criteria ?? ''}
        name='criteria'
        label='Additional instructions'
        description='Optional instructions to guide the evaluators on the criteria to judge against'
        placeholder='Judge the engagement of the response'
        minRows={2}
        maxRows={4}
        onChange={(e) =>
          setConfiguration({ ...configuration, criteria: e.target.value })
        }
        errors={errors?.['criteria']}
        className='w-full'
        disabled={disabled}
        required
      />
      {!!metricSpecification.ConfigurationAdvancedForm && (
        <metricSpecification.ConfigurationAdvancedForm
          mode={mode}
          uuid={uuid}
          configuration={configuration}
          setConfiguration={setConfiguration}
          errors={errors}
          disabled={disabled}
          {...rest}
        />
      )}
    </>
  )
}

function ResultBadge<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: ResultBadgeProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      <metricSpecification.ResultBadge {...rest} />
    </>
  )
}

function AnnotationForm<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: AnnotationFormProps<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) return null

  return (
    <>
      {!!metricSpecification.AnnotationForm && (
        <metricSpecification.AnnotationForm {...rest} />
      )}
    </>
  )
}

function chartConfiguration<M extends HumanEvaluationMetric>({
  metric,
  ...rest
}: ChartConfigurationArgs<EvaluationType.Human, M> & {
  metric: M
}) {
  const metricSpecification = METRICS[metric]
  if (!metricSpecification) {
    throw new Error('Invalid evaluation metric')
  }

  return metricSpecification.chartConfiguration(rest)
}
