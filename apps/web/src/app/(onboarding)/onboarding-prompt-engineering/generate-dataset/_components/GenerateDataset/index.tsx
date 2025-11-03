'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense, useCallback } from 'react'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { OnboardingEditor } from '../../../_components/OnboardingEditor'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { usePromptEngineeringOnboarding } from '$/app/(onboarding)/onboarding-prompt-engineering/datasetOnboarding'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'

export function GenerateDatasetBody() {
  const { initialValue, documentParameters } = usePromptEngineeringOnboarding()
  const router = useNavigate()
  const moveNextStep = useCallback(() => {
    router.push(ROUTES.onboarding.promptEngineering.runExperiment)
  }, [router])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full max-h-[132px] min-w-[560px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <div className='relative h-full'>
              <OnboardingEditor readOnly={true} initialValue={initialValue} />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background to-background/40' />
            </div>
          </Suspense>
          <div className='absolute inset-x-0 bottom-[-7.5rem] h-full w-full bg-background'>
            <TableSkeleton
              rows={6}
              cols={documentParameters}
              maxHeight={320}
              animate={false}
            />
            <div className='pointer-events-none absolute inset-x-0 bottom-[-7.5rem] h-44 bg-gradient-to-t from-background via-background/80 to-transparent' />
          </div>
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
