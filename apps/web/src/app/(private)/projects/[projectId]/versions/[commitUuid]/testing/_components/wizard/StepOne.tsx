'use client'

import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { WizardState } from '../CreateTestWizard'

interface StepOneProps {
  state: WizardState
  onStateChange: (updates: Partial<WizardState>) => void
}

export function StepOne({ state, onStateChange }: StepOneProps) {
  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <Text.H4M>Deployment test</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Choose the type of deployment test
        </Text.H5>
      </div>

      <div className='grid grid-cols-2 gap-6'>
        {/* Shadow Testing Card */}
        <Card
          className={`p-6 cursor-pointer transition-all ${
            state.testType === 'shadow'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => onStateChange({ testType: 'shadow' })}
        >
          <div className='flex flex-col gap-2'>
            <Text.H4>🌑 Shadow Testing</Text.H4>
            <Text.H6 color='foregroundMuted'>
              Run challenger in parallel (simulated). No impact on users. Best
              for: Initial validation before A/B testing.
            </Text.H6>
          </div>
        </Card>

        {/* A/B Testing Card */}
        <Card
          className={`p-6 cursor-pointer transition-all ${
            state.testType === 'ab'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => onStateChange({ testType: 'ab' })}
        >
          <div className='flex flex-col gap-2'>
            <Text.H4>🔀 A/B Testing</Text.H4>
            <Text.H6 color='foregroundMuted'>
              Split traffic between versions (real runs). Real performance data.
              Best for: Final validation before deploy.
            </Text.H6>
          </div>
        </Card>
      </div>
    </div>
  )
}
