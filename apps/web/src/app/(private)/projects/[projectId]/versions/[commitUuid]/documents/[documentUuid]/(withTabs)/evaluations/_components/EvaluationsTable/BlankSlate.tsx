import { useProductAccess } from '$/components/Providers/SessionProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
} from '@latitude-data/web-ui/molecules/BlankSlateWithSteps'
import { useState } from 'react'
import { EvaluationsGenerator } from '../EvaluationsGenerator'

export function EvaluationsTableBlankSlate({
  createEvaluation,
  generateEvaluation,
  generatorEnabled,
  isCreatingEvaluation,
  isGeneratingEvaluation,
}: {
  createEvaluation: ReturnType<typeof useEvaluationsV2>['createEvaluation']
  generateEvaluation: ReturnType<typeof useEvaluationsV2>['generateEvaluation']
  generatorEnabled: boolean
  isCreatingEvaluation: boolean
  isGeneratingEvaluation: boolean
}) {
  const { promptManagement } = useProductAccess()
  const [openGenerateModal, setOpenGenerateModal] = useState(false)

  return (
    <BlankSlateWithSteps
      title='Welcome to evaluations'
      description='There are no evaluations created yet. Check out how it works before getting started.'
    >
      <BlankSlateStep
        number={1}
        title='Learn how it works'
        description='Watch the video below to see how evaluations can be used to assess the quality of your prompts.'
      >
        <iframe
          className='w-full aspect-video rounded-md'
          src={`https://www.youtube.com/embed/cTs-qfO6H-8`}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          allowFullScreen
          title='How to evaluate your prompts using LLMs and Latitude.so'
        />
      </BlankSlateStep>
      {promptManagement && (
        <BlankSlateStep
          number={2}
          title='Generate an evaluation'
          description='Our AI can craft an evaluation just for this specific prompt, try it out!'
          className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
        >
          <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
            <div className='max-h-[272px] overflow-hidden'>
              <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
                {generatorEnabled
                  ? `
---
  provider: OpenAI
  model: gpt-5.2
---
This is just a placeholder for the evaluation prompt because generating it takes a bit longer than we'd like. Click the button to actually generate the evaluation, it's free as this one is on us.

Don't rawdog your prompts!
            `.trim()
                  : `
---
  provider: OpenAI
  model: gpt-5.2
---
This is just a placeholder for the evaluation prompt because the evaluation generator is disabled. If it were enabled, you could click the button to actually generate the evaluation.

Don't rawdog your prompts!
            `.trim()}
              </span>
            </div>
            <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-secondary to-transparent pointer-events-none'></div>
            <div className='flex justify-center absolute right-0 bottom-4 w-full'>
              <Button
                fancy
                onClick={() => setOpenGenerateModal(true)}
                disabled={!generatorEnabled}
              >
                Generate the evaluation
              </Button>
              <EvaluationsGenerator
                open={openGenerateModal}
                setOpen={setOpenGenerateModal}
                createEvaluation={createEvaluation}
                generateEvaluation={generateEvaluation}
                generatorEnabled={generatorEnabled}
                isCreatingEvaluation={isCreatingEvaluation}
                isGeneratingEvaluation={isGeneratingEvaluation}
              />
            </div>
          </div>
        </BlankSlateStep>
      )}
    </BlankSlateWithSteps>
  )
}
