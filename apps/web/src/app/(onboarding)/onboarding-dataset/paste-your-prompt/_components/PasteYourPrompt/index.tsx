'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Suspense, useCallback, useState } from 'react'
import { BlocksEditorPlaceholder } from '$/components/BlocksEditor'
import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import useDatasets from '$/stores/datasets'
import { OnboardingEditor } from '../../../_components/OnboardingEditor'
import { scan } from 'promptl-ai'
import { fromAstToBlocks } from '$/components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { useDatasetOnboarding } from '$/stores/datasetOnboarding'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'

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

export function PasteYourPromptBody() {
  const { value, updateDocumentContent } = useDocumentValue()
  const { data: datasets, runGenerateAction } = useDatasets()
  const [editorKey, setEditorKey] = useState(0)
  const { initialValue, setInitialValue, setDocumentParameters } =
    useDatasetOnboarding()
  const router = useNavigate()

  const onNext = useCallback(async () => {
    // We need max speed here, so we don't want to use the useMetadata hook to get the metadata.ast or parameters
    const metadata = await scan({ prompt: value })
    setInitialValue(fromAstToBlocks({ ast: metadata.ast, prompt: value }))
    // If the user doesnt add any parameters, we default to 'message'
    const documentParameters =
      Array.from(metadata.parameters).length > 0
        ? Array.from(metadata.parameters)
        : ['message']
    setDocumentParameters(documentParameters)
    const parameters = documentParameters.join(', ') ?? 'message'

    const datasetName = datasets?.length
      ? `Dataset Onboarding ${datasets.length}`
      : 'Dataset Onboarding'

    runGenerateAction({
      parameters,
      prompt: value,
      rowCount: 10,
      name: datasetName,
      fromCloud: false,
    })
    router.push(ROUTES.onboarding.dataset.generateDataset)
  }, [
    runGenerateAction,
    setDocumentParameters,
    setInitialValue,
    value,
    router,
    datasets.length,
  ])

  const onUseSamplePrompt = useCallback(async () => {
    // We need max speed here, so we don't want to use the useMetadata hook to get the metadata.ast or parameters
    const metadata = await scan({ prompt: SAMPLE_PROMPT })
    const newInitialValue = fromAstToBlocks({
      ast: metadata.ast,
      prompt: SAMPLE_PROMPT,
    })
    setInitialValue(newInitialValue)
    updateDocumentContent(SAMPLE_PROMPT)
    setDocumentParameters(Array.from(metadata.parameters ?? []))
    // Force re-render of OnboardingEditor by changing key
    setEditorKey((prev) => prev + 1)
  }, [setInitialValue, setDocumentParameters, updateDocumentContent])

  return (
    <div className='flex flex-row items-center gap-10 h-full w-full'>
      <div className='flex flex-col items-end w-full h-full'>
        <div className='relative flex-1 w-full min-h-0 max-h-[350px] max-w-[560px]'>
          <Suspense fallback={<BlocksEditorPlaceholder />}>
            <OnboardingEditor
              key={editorKey}
              readOnly={false}
              initialValue={initialValue}
            />
            <div className='absolute bottom-[-1.5rem] left-1/2 -translate-x-1/2 border border-border rounded-lg bg-background p-2'>
              <Button
                fancy
                className='w-full'
                variant='outline'
                onClick={onUseSamplePrompt}
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
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
