import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '@latitude-data/constants/issues'

type InsufficientAnnotationsProps = {
  negativeAnnotationsOfThisIssue: number
  positiveAndNegativeAnnotationsOfOtherIssues: number
}

export function InsufficientAnnotations({
  negativeAnnotationsOfThisIssue,
  positiveAndNegativeAnnotationsOfOtherIssues,
}: InsufficientAnnotationsProps) {
  // We want to avoid showing more annotations than the minimum required
  const negativeAnnotations =
    negativeAnnotationsOfThisIssue < MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE
      ? negativeAnnotationsOfThisIssue
      : MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE
  const positiveAnnotations =
    positiveAndNegativeAnnotationsOfOtherIssues <
    MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES
      ? positiveAndNegativeAnnotationsOfOtherIssues
      : MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES

  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div className='flex flex-col gap-2'>
        <Text.H6M color='foregroundMuted'>Annotate more to generate</Text.H6M>
        <div className='flex flex-row items-center gap-1'>
          <div className='flex items-center justify-center bg-success-muted rounded-xl py-0.5 px-1.5 gap-1'>
            <Icon
              name='thumbsUp'
              color='successMutedForeground'
              size='small'
              strokeWidth={2.5}
            />
            <Text.H6M color='successMutedForeground'>
              {positiveAnnotations} /{' '}
              {MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES}
            </Text.H6M>
          </div>
          <Text.H6 color='foregroundMuted'> · </Text.H6>
          <div className='flex items-center justify-center bg-destructive-muted rounded-xl py-0.5 px-1.5 gap-1'>
            <Icon
              name='thumbsDown'
              color='destructiveMutedForeground'
              size='small'
              strokeWidth={2.5}
            />
            <Text.H6M color='destructiveMutedForeground'>
              {negativeAnnotations} /{' '}
              {MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE}
            </Text.H6M>
          </div>
        </div>
      </div>
    </div>
  )
}
