import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Suspense, useCallback } from 'react'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useMetadata } from '$/hooks/useMetadata'
import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'
import useDatasets from '$/stores/datasets'
import { OnboardingEditor } from '../_components/OnboardingEditor'

const SAMPLE_PROMPT = `
---
provider: OpenAI
model: gpt-4.1-mini
---

This is a response from an NPS survey:

Score: {{score}} 
Message: {{message}} 

Analyze the sentiment based on both the score and message. Prioritize identifying the primary concern in the feedback, 
focusing on the core issue mentioned by the user. Categorize the sentiment into one of the following categories:

- Product Features and Functionality
- User Interface (UI) and User Experience (UX)
- Performance and Reliability
- Customer Support and Service
- Onboarding and Learning Curve
- Pricing and Value Perception
- Integrations and Compatibility
- Scalability and Customization
- Feature Requests and Product Roadmap
- Competitor Comparison
- General Feedback (Neutral/Non-specific)

Return only one of the categories.
`

export function PasteYourPromptBody({
  setCurrentOnboardingStep,
}: {
  setCurrentOnboardingStep: (step: DatasetOnboardingStepKey) => void
}) {
  const { value, updateDocumentContent } = useDocumentValue()
  const { runGenerateAction } = useDatasets()
  const { metadata } = useMetadata()

  const generateDataset = useCallback(
    async (value: string) => {
      updateDocumentContent(value)
      const parameters = Array.from(metadata?.parameters ?? []).join(', ') ?? ''
      setCurrentOnboardingStep(DatasetOnboardingStepKey.GenerateDataset)
      runGenerateAction({
        parameters,
        prompt: value,
        rowCount: 10,
        name: 'Onboarding Dataset',
        fromCloud: false,
      })
    },
    [
      metadata,
      runGenerateAction,
      setCurrentOnboardingStep,
      updateDocumentContent,
    ],
  )

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full max-h-[350px] max-w-[600px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <OnboardingEditor initialValue={emptyRootBlock} readOnly={false} />
            <div className='absolute bottom-[-1.5rem] left-1/2 -translate-x-1/2 border border-border rounded-lg bg-background p-2'>
              <Button
                fancy
                className='w-full'
                variant='outline'
                onClick={() => generateDataset(SAMPLE_PROMPT)}
              >
                Use sample prompt
              </Button>
            </div>
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
              Step 1 of 3
            </Badge>
            <Text.H4M>Paste Your Prompt</Text.H4M>
          </div>
          <div className='flex flex-col gap-4 max-w-[300px]'>
            <Text.H5 color='foregroundMuted'>
              With Latitude, it's easy to test your
              <br />
              prompts at scale.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Paste one of your existing prompts here.
            </Text.H5>
            <Text.H5 color='foregroundMuted'>
              Make sure you replace any dynamic parts with{' '}
              <Badge
                variant='accent'
                shape='rounded'
                className='w-fit font-medium'
              >
                &#123;&#123; input &#125;&#125;
              </Badge>{' '}
              variables.
            </Text.H5>
          </div>
        </div>
        <Button
          fancy
          className='w-full'
          iconProps={{ placement: 'right', name: 'arrowRight' }}
          onClick={() => generateDataset(value)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
