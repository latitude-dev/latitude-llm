import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnnotationFormProps, EVALUATION_SPECIFICATIONS } from './index'

export default function AnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ evaluation, ...rest }: AnnotationFormProps<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification.AnnotationForm) return null

  return (
    <form className='min-w-0' id='annotationForm'>
      <FormWrapper>
        <div className='flex flex-col gap-y-2'>
          <Text.H6>{evaluation.description || 'No description'}</Text.H6>
          {evaluation.configuration.reverseScale && (
            <Text.H6M>
              Note:{' '}
              <Text.H6>
                This evaluation's scale is reversed. That means a lower score is
                better.
              </Text.H6>
            </Text.H6M>
          )}
        </div>
        <typeSpecification.AnnotationForm
          metric={evaluation.metric}
          evaluation={evaluation}
          {...rest}
        />
      </FormWrapper>
    </form>
  )
}
