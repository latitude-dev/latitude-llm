'use client'

import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { TabSelector } from '$/components/TabSelector'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'

interface TestingSectionProps {
  enabled: boolean
  testType: 'shadow' | 'ab' | null
  trafficPercentage: number
  onEnabledChange: (enabled: boolean) => void
  onTestTypeChange: (testType: 'shadow' | 'ab') => void
  onTrafficPercentageChange: (percentage: number) => void
}

export function TestingSection({
  enabled,
  testType,
  trafficPercentage,
  onEnabledChange,
  onTestTypeChange,
  onTrafficPercentageChange,
}: TestingSectionProps) {
  return (
    <div className='flex flex-col gap-y-4'>
      <div className='flex justify-end'>
        <SwitchInput
          checked={enabled}
          onCheckedChange={onEnabledChange}
          label='Deploy as test version'
          fullWidth={false}
          inverted
        />
      </div>
      <div className={`flex flex-col gap-y-4 ${enabled ? '' : 'opacity-50'}`}>
        <div className='flex flex-col gap-y-2'>
          <TabSelector
            options={[
              { label: 'Shadow Test', value: 'shadow' },
              { label: 'A/B Test', value: 'ab' },
            ]}
            selected={testType || undefined}
            onSelect={(value) => onTestTypeChange(value as 'shadow' | 'ab')}
            disabled={!enabled}
            fullWidth
          />
          {testType && (
            <Text.H6 color='foregroundMuted'>
              {testType === 'shadow'
                ? 'Run the new version alongside production without affecting users'
                : 'Split traffic between the current version and the new version'}
            </Text.H6>
          )}
        </div>
        <FormWrapper>
          {testType && (
            <div className='flex flex-col gap-y-4'>
              <div className='flex flex-col gap-y-2'>
                <Text.H5M>Traffic percentage</Text.H5M>
                <Text.H6 color='foregroundMuted'>
                  {testType === 'shadow'
                    ? 'Percentage of traffic to shadow test'
                    : 'Percentage of traffic to route to the new version'}
                </Text.H6>
              </div>
              <div className='flex flex-row items-center gap-4 px-2'>
                <Text.H6
                  color={
                    trafficPercentage === 0
                      ? 'accentForeground'
                      : 'foregroundMuted'
                  }
                >
                  0%
                </Text.H6>
                <div className='relative flex-grow min-w-0'>
                  <Slider
                    showMiddleRange
                    disabled={!enabled}
                    min={0}
                    max={100}
                    step={1}
                    value={[trafficPercentage]}
                    onValueChange={(value) =>
                      onTrafficPercentageChange(value[0]!)
                    }
                  />
                </div>
                <Text.H6
                  color={
                    trafficPercentage === 100
                      ? 'accentForeground'
                      : 'foregroundMuted'
                  }
                >
                  100%
                </Text.H6>
              </div>
              <div className='flex justify-center'>
                <Text.H4M color='accentForeground'>
                  {trafficPercentage}%
                </Text.H4M>
              </div>
            </div>
          )}
        </FormWrapper>
      </div>
    </div>
  )
}
