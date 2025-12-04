'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

interface StepThreeProps {
  testType: string | null
  trafficPercentage: number
  testName: string
  testDescription: string
  onTrafficPercentageChange: (percentage: number) => void
  onTestNameChange: (name: string) => void
  onTestDescriptionChange: (description: string) => void
}

export function StepThree({
  testType,
  trafficPercentage,
  testName,
  testDescription,
  onTrafficPercentageChange,
  onTestNameChange,
  onTestDescriptionChange,
}: StepThreeProps) {
  const showTrafficSlider = testType === 'ab'
  const isShadowTest = testType === 'shadow'

  return (
    <div className='flex flex-col gap-6'>
      <div className='space-y-4'>
        <div>
          <Input
            name='testName'
            label='Test name'
            value={testName}
            onChange={(e) => onTestNameChange(e.target.value)}
            placeholder='e.g., GPT-4o-mini optimization v2'
          />
        </div>

        <div>
          <TextArea
            name='testDescription'
            label='description'
            value={testDescription}
            onChange={(e) => onTestDescriptionChange(e.target.value)}
            placeholder='Describe what you are testing and why...'
            rows={4}
          />
        </div>

        {showTrafficSlider && (
          <div>
            <div className='flex justify-between items-center'>
              <Text.H5>Traffic Split</Text.H5>
              <Text.H6>{trafficPercentage}% to Challenger</Text.H6>
            </div>
            <Slider
              value={[trafficPercentage]}
              onValueChange={([value]) => onTrafficPercentageChange(value)}
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
