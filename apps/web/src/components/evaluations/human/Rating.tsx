import { use, useCallback, useMemo } from 'react'
import { formatCount } from '@latitude-data/constants/formatCount'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  HumanEvaluationRatingSpecification,
} from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { NumberInput } from '@latitude-data/web-ui/atoms/NumberInput'
import { StepperNumberInput } from '@latitude-data/web-ui/atoms/StepperNumberInput'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CriteriaDescription as CriteriaWrapper } from '../Annotation/CriteriaDescription'
import {
  AnnotationFormWrapper as AForm,
  AnnotationContext,
} from '../Annotation/FormWrapper'
import {
  AnnotationFormProps,
  ChartConfigurationArgs,
  ConfigurationFormProps,
  ResultBadgeProps,
} from '../index'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

const specification = HumanEvaluationRatingSpecification
export default {
  ...specification,
  icon: 'star' as IconName,
  ConfigurationSimpleForm,
  ConfigurationAdvancedForm,
  ResultBadge,
  AnnotationForm,
  chartConfiguration,
}

function ConfigurationSimpleForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        label='Minimum rating'
        description='Additional guidelines describing when the response should be rated low'
      >
        <NumberInput
          defaultValue={configuration.minRating ?? undefined}
          name='minRating'
          placeholder='0'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, minRating: value })
          }}
          errors={errors?.['minRating']}
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.minRatingDescription ?? ''}
          name='minRatingDescription'
          placeholder='The response discourages interaction'
          onChange={(e) =>
            setConfiguration({
              ...configuration,
              minRatingDescription: e.target.value,
            })
          }
          errors={errors?.['minRatingDescription']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
      <FormFieldGroup
        layout='horizontal'
        label='Maximum rating'
        description='Additional guidelines describing when the response should be rated high'
      >
        <NumberInput
          defaultValue={configuration.maxRating ?? undefined}
          name='maxRating'
          placeholder='5'
          onChange={(value) => {
            if (value === undefined) return
            setConfiguration({ ...configuration, maxRating: value })
          }}
          errors={errors?.['maxRating']}
          className='w-full'
          fieldClassName='w-1/6'
          disabled={disabled}
          required
        />
        <Input
          value={configuration.maxRatingDescription ?? ''}
          name='maxRatingDescription'
          placeholder='The response promotes continued interaction'
          onChange={(e) =>
            setConfiguration({
              ...configuration,
              maxRatingDescription: e.target.value,
            })
          }
          errors={errors?.['maxRatingDescription']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ConfigurationAdvancedForm({
  configuration,
  setConfiguration,
  errors,
  disabled,
}: ConfigurationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return (
    <>
      <FormFieldGroup
        layout='horizontal'
        description='The minimum and maximum rating threshold of the response'
      >
        <NumberInput
          defaultValue={configuration.minThreshold ?? undefined}
          name='minThreshold'
          label='Minimum threshold'
          placeholder='No minimum'
          min={configuration.minRating}
          max={configuration.maxRating}
          onChange={(value) =>
            setConfiguration({ ...configuration, minThreshold: value })
          }
          errors={errors?.['minThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
        <NumberInput
          defaultValue={configuration.maxThreshold ?? undefined}
          name='maxThreshold'
          label='Maximum threshold'
          placeholder='No maximum'
          min={configuration.minRating}
          max={configuration.maxRating}
          onChange={(value) =>
            setConfiguration({ ...configuration, maxThreshold: value })
          }
          errors={errors?.['maxThreshold']}
          className='w-full'
          disabled={disabled}
          required
        />
      </FormFieldGroup>
    </>
  )
}

function ResultBadge({
  result,
}: ResultBadgeProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return <>{formatCount(result.score!)}</>
}

function getCriteria(
  evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric.Rating>,
) {
  const config = evaluation.configuration
  const criteria = config.criteria
  const minRatingDescription = config.minRatingDescription
  const maxRatingDescription = config.maxRatingDescription
  const reverseScale = config.reverseScale
  const isEmpty =
    !minRatingDescription && !maxRatingDescription && !criteria && !reverseScale

  if (isEmpty) return null

  return {
    criteria,
    minRatingDescription,
    maxRatingDescription,
    reverseScale,
  }
}

type ICriteria = ReturnType<typeof getCriteria>

function CriteriaDescription({
  minRatingDescription,
  maxRatingDescription,
  reverseScale,
  criteria,
}: NonNullable<ICriteria>) {
  return (
    <CriteriaWrapper reverseScale={reverseScale} criteria={criteria}>
      {minRatingDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            Low score criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{minRatingDescription}</Text.H6>
        </div>
      ) : null}
      {maxRatingDescription ? (
        <div>
          <Text.H5M color='background' display='block'>
            High score criteria
          </Text.H5M>
          <Text.H6 color='primaryForeground'>{maxRatingDescription}</Text.H6>
        </div>
      ) : null}
    </CriteriaWrapper>
  )
}

function ThresholdTooltip({
  minThreshold,
  maxThreshold,
  reverseScale,
}: {
  minThreshold?: number
  maxThreshold?: number
  reverseScale?: boolean
}) {
  const hasThresholds = minThreshold !== undefined || maxThreshold !== undefined

  if (!hasThresholds) {
    return (
      <div className='flex flex-col gap-2 p-2'>
        <Text.H6 color='background'>No pass/fail thresholds configured</Text.H6>
      </div>
    )
  }

  const passRange = reverseScale
    ? maxThreshold !== undefined
      ? `≥ ${maxThreshold}`
      : minThreshold !== undefined
        ? `< ${minThreshold}`
        : 'Any score'
    : minThreshold !== undefined
      ? `≥ ${minThreshold}`
      : maxThreshold !== undefined
        ? `< ${maxThreshold}`
        : 'Any score'

  const failRange = reverseScale
    ? minThreshold !== undefined
      ? `< ${minThreshold}`
      : maxThreshold !== undefined
        ? `≥ ${maxThreshold}`
        : 'Any score'
    : maxThreshold !== undefined
      ? `≥ ${maxThreshold}`
      : minThreshold !== undefined
        ? `< ${minThreshold}`
        : 'Any score'

  return (
    <div className='flex flex-col gap-2 p-2 min-w-48'>
      <div>
        <Text.H5M color='background' display='block'>
          Pass/Fail thresholds
        </Text.H5M>
      </div>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <div className='w-3 h-3 rounded-full bg-success-muted dark:bg-success' />
          <Text.H6 color='background'>Pass: {passRange}</Text.H6>
        </div>
        <div className='flex items-center gap-2'>
          <div className='w-3 h-3 rounded-full bg-destructive-muted dark:background-destructive' />
          <Text.H6 color='background'>Fail: {failRange}</Text.H6>
        </div>
      </div>
      {reverseScale && (
        <Text.H6 color='background'>Lower scores are better</Text.H6>
      )}
    </div>
  )
}

function AnnotationForm({
  evaluation,
  result,
}: AnnotationFormProps<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  const criteria = useMemo(() => getCriteria(evaluation), [evaluation])
  const {
    onSubmit,
    isExpanded,
    setIsExpanded,
    localReason,
    setLocalReason,
    localScore,
    setLocalScore,
  } = use(AnnotationContext)

  const variant = result?.hasPassed
    ? result.hasPassed === true
      ? 'success'
      : 'destructive'
    : 'default'

  const handleScoreChange = useCallback(
    (value: number | undefined) => {
      if (value === undefined) return

      setLocalScore(value)

      // Expand the form when user interacts
      if (!isExpanded) {
        setIsExpanded(true)
      }
    },
    [isExpanded, setIsExpanded, setLocalScore],
  )

  const handleSave = useCallback(() => {
    if (localScore === undefined) return

    onSubmit({
      score: localScore,
      resultMetadata: {
        ...result?.metadata,
        reason: localReason,
      },
    })
  }, [localScore, localReason, result?.metadata, onSubmit])

  return (
    <>
      {isExpanded && (
        <div className='animate-in fade-in slide-in-from-top-2 duration-300'>
          <AForm.Body>
            <AForm.TextArea
              name='reason'
              value={localReason}
              onChange={setLocalReason}
            />
          </AForm.Body>
        </div>
      )}
      <AForm.Footer>
        <div className='flex items-center gap-x-2'>
          <StepperNumberInput
            name='score'
            value={localScore}
            min={evaluation.configuration.minRating}
            max={evaluation.configuration.maxRating}
            onChange={handleScoreChange}
            variant={variant}
          />
          {isExpanded && (
            <div className='animate-in fade-in duration-300'>
              <Tooltip
                trigger={
                  <div className='flex gap-x-1 items-center'>
                    <Text.H6M color='foregroundMuted'>
                      of {evaluation.configuration.maxRating}
                    </Text.H6M>
                    <Icon name='info' color='foregroundMuted' />
                  </div>
                }
              >
                <ThresholdTooltip
                  minThreshold={evaluation.configuration.minThreshold}
                  maxThreshold={evaluation.configuration.maxThreshold}
                  reverseScale={evaluation.configuration.reverseScale}
                />
              </Tooltip>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className='animate-in fade-in duration-300 flex items-center gap-x-2'>
            <AForm.SaveButton onClick={handleSave} />
            <AForm.AnnotationTooltipInfo
              tooltip={
                criteria ? <CriteriaDescription {...criteria} /> : undefined
              }
            />
          </div>
        )}
      </AForm.Footer>
    </>
  )
}

function chartConfiguration({
  evaluation,
}: ChartConfigurationArgs<EvaluationType.Human, HumanEvaluationMetric.Rating>) {
  return {
    min: evaluation.configuration.minRating,
    max: evaluation.configuration.maxRating,
    thresholds: {
      lower: evaluation.configuration.minThreshold,
      upper: evaluation.configuration.maxThreshold,
    },
    scale: (point: number) => point,
    format: (point: number, short?: boolean) =>
      short ? `${formatCount(point)}` : `${point.toFixed(2)}`,
  }
}
