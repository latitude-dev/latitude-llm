import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function EvaluationGenerationError({
  error,
}: {
  error: Error | undefined
}) {
  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <div className='flex flex-row items-center gap-2'>
        <Icon name='circleX' color='destructive' />
        <div className='flex flex-col'>
          {error && error.message && error.message.includes('Max attempts') ? (
            <>
              <Text.H6M>Not enough annotations to generate</Text.H6M>
              <Text.H6 color='foregroundMuted'>
                Please annotate more traces
              </Text.H6>
            </>
          ) : (
            <>
              <Text.H6M>Failed to generate</Text.H6M>
              <Text.H6 color='foregroundMuted'>Please try again</Text.H6>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
