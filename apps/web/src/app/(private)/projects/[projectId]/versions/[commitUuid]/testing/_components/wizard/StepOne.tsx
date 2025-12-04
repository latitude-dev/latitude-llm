'use client'

import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Text } from '@latitude-data/web-ui/atoms/Text'

interface StepOneProps {
  testType: string | null
  onTestTypeChange: (testType: 'shadow' | 'ab') => void
}

export function StepOne({ testType, onTestTypeChange }: StepOneProps) {
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid grid-cols-2 gap-6'>
        {/* Shadow Testing Card */}
        <Card
          className={`p-6 cursor-pointer transition-all ${
            testType === 'shadow'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => onTestTypeChange('shadow')}
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
            testType === 'ab'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => onTestTypeChange('ab')}
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
