import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { useMetadata } from '$/hooks/useMetadata'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Suspense, useCallback } from 'react'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { fromAstToBlocks } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import { OnboardingEditor } from '../_components/OnboardingEditor'
import SimpleDatasetTable from '../_components/SimpleDatasetTable'

export function GenerateDatasetBody({
  setCurrentOnboardingStep,
}: {
  setCurrentOnboardingStep: (step: DatasetOnboardingStepKey) => void
}) {
  const { value } = useDocumentValue()
  const { metadata } = useMetadata()

  const moveNextStep = useCallback(() => {
    setCurrentOnboardingStep(DatasetOnboardingStepKey.RunExperiment)
  }, [setCurrentOnboardingStep])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full max-h-[350px] max-w-[600px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <div className='relative p-4'>
              <OnboardingEditor
                initialValue={
                  metadata?.ast
                    ? fromAstToBlocks({
                        ast: metadata.ast,
                        prompt: value,
                      })
                    : emptyRootBlock
                }
                readOnly={true}
              />
              <div
                aria-hidden
                className='pointer-events-none absolute inset-0 bg-background/60 backdrop-saturate-50'
              />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-background via-background to-transparent' />
            </div>
            <SimpleDatasetTable numberOfRows={4} onlyShowSkeleton={true} />
          </Suspense>
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
