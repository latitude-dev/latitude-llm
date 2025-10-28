import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useMetadata } from '$/hooks/useMetadata'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCallback } from 'react'

export function GenerateDatasetBody({
  setCurrentOnboardingStep,
}: {
  setCurrentOnboardingStep: (step: DatasetOnboardingStepKey) => void
}) {
  const { metadata } = useMetadata()
  const parameters = Array.from(metadata?.parameters ?? []).join(', ') ?? ''
  const moveNextStep = useCallback(() => {
    setCurrentOnboardingStep(DatasetOnboardingStepKey.RunExperiment)
  }, [setCurrentOnboardingStep])

  console.log('GenerateDatasetBody render with parameters:', parameters)

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end gap-10 w-full h-full'>
        <div className='flex-1 w-full max-h-[350px] max-w-[600px]'>
          <LoadingText />
        </div>
      </div>
      <div className='flex flex-col items-start gap-8 w-full h-full'>
        <div className='flex flex-col items-start gap-6'>
          <div className='flex flex-col gap-4 w-full'>
            <Badge
              variant='accent'
              shape='rounded'
              className='w-fit font-medium'
            >
              Step 2 of 3
            </Badge>
            <Text.H4M>Use a dataset</Text.H4M>
          </div>
          <div className='flex flex-col gap-4 max-w-[300px]'>
            <Text.H5 color='foregroundMuted'>
              Next, we need to use some data to
              <br />
              populate your prompt.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Later, you can upload your own dataset or
              <br />
              integrate our SDK to use production data.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              For now, we'll generate some synthetic
              <br />
              data based on your prompt.
            </Text.H5>
          </div>
        </div>
        <Button
          fancy
          className='w-full'
          iconProps={{ placement: 'right', name: 'arrowRight' }}
          onClick={moveNextStep}
        >
          Generate Dataset
        </Button>
      </div>
    </div>
  )
}
