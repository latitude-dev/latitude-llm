'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { WizardState } from '../CreateTestWizard'

interface StepFourProps {
  testType: 'shadow' | 'ab'
  trafficPercentage: number
  onChange: (updates: Partial<WizardState>) => void
}

export function StepFour({
  testType,
  trafficPercentage,
  onChange,
}: StepFourProps) {
  if (testType === 'shadow') {
    return (
      <div className='flex flex-col gap-6'>
        <div>
          <Text.H3>Shadow Test Summary</Text.H3>
          <Text.H7>Your shadow test is ready to start</Text.H7>
        </div>

        <div className='space-y-4'>
          <div className='p-4 bg-muted rounded-lg'>
            <Text.H5>Shadow Testing Details</Text.H5>
            <div className='space-y-2 mt-2'>
              <Text.H7>
                • Baseline will run as normal with all real user traffic
              </Text.H7>
              <Text.H7>
                • Challenger will run in parallel (simulated) without impacting
                users
              </Text.H7>
              <Text.H7>• Both versions will be evaluated automatically</Text.H7>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Text.H3>Traffic Split</Text.H3>
        <Text.H7>Configure how traffic will be split between versions</Text.H7>
      </div>

      <div className='space-y-6'>
        <div>
          <div className='flex justify-between mb-4'>
            <div>
              <Text.H5>Baseline</Text.H5>
              <Text.H6>{100 - trafficPercentage}%</Text.H6>
            </div>
            <div className='text-right'>
              <Text.H5>Challenger</Text.H5>
              <Text.H6>{trafficPercentage}%</Text.H6>
            </div>
          </div>

          <Slider
            value={[trafficPercentage]}
            onValueChange={(value) => onChange({ trafficPercentage: value[0] })}
            min={0}
            max={100}
            step={1}
            className='w-full'
          />
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <div className='p-3 bg-blue-50 rounded-lg'>
            <Text.H7 weight='medium'>Baseline (Control)</Text.H7>
            <Text.H8>Receives {100 - trafficPercentage}% of traffic</Text.H8>
          </div>
          <div className='p-3 bg-green-50 rounded-lg'>
            <Text.H7 weight='medium'>Challenger (Test)</Text.H7>
            <Text.H8>Receives {trafficPercentage}% of traffic</Text.H8>
          </div>
        </div>

        <div className='p-4 bg-amber-50 rounded-lg'>
          <Text.H6>💡 Recommendation</Text.H6>
          <div style={{ marginTop: '0.5rem' }}>
            <Text.H7>
              Start with 50/50 split for balanced results, or ramp up gradually
              (10% → 25% → 50%) to detect issues early
            </Text.H7>
          </div>
        </div>
      </div>
    </div>
  )
}
