'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { WizardState } from '../CreateTestWizard'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

interface StepThreeProps {
  state: WizardState
  onStateChange: (updates: Partial<WizardState>) => void
  projectId: number
}

export function StepThree({ state, onStateChange }: StepThreeProps) {
  const showTrafficSlider = state.testType === 'ab'
  const isShadowTest = state.testType === 'shadow'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <Text.H4M>Configure Test</Text.H4M>
        <Text.H5 color='foregroundMuted'>Set name and description</Text.H5>
      </div>

      <div className='space-y-4'>
        <div>
          <Input
            label='Test name'
            value={state.name}
            onChange={(e) => onStateChange({ name: e.target.value })}
            placeholder='e.g., GPT-4o-mini optimization v2'
          />
        </div>

        <div>
          <TextArea
            label='description'
            value={state.description}
            onChange={(e) => onStateChange({ description: e.target.value })}
            placeholder='Describe what you are testing and why...'
            rows={4}
          />
        </div>

        {showTrafficSlider && (
          <div>
            <div className='flex justify-between items-center'>
              <Text.H5>Traffic Split</Text.H5>
              <Text.H6>{state.trafficPercentage}% to Challenger</Text.H6>
            </div>
            <Slider
              value={[state.trafficPercentage]}
              onValueChange={([value]) =>
                onStateChange({ trafficPercentage: value })
              }
              min={0}
              max={100}
              step={5}
            />
          </div>
        )}
        {isShadowTest && (
          <Alert description='Shadow tests run in the background on every production request with simulated tool executions. Evaluations will also run for shadow tests so you will be able to compare performance between versions.' />
        )}
      </div>
    </div>
  )
}
