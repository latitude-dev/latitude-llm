import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import { PromptConfigurationProps, useConfigValue } from './utils'

export function GenerationSettings({
  config,
  setConfig,
  disabled,
}: PromptConfigurationProps) {
  const { value: temperatureValue, setValue: setTemperatureValue } =
    useConfigValue<number>({
      config,
      setConfig,
      key: 'temperature',
      defaultValue: 1,
    })

  return (
    <ConfigSection title='Generation'>
      <ConfigElement
        label='Temperature'
        icon='thermometer'
        summary='Controls the randomness of the generated text.'
        description={`The temperature parameter controls the randomness of the generated text.
Lower temperatures make the model more confident, but also give similar responses every time.
Higher temperatures make the model more creative, but also more unpredictable.
A temperature of 0 will always return the same output given the same input, successfully caching the model response and not spending any tokens when given the same input.`}
        descriptionCanOverflowInput
      >
        <div className='flex flex-row items-center gap-2'>
          <Text.H6
            color={
              temperatureValue === 0 ? 'accentForeground' : 'foregroundMuted'
            }
          >
            Deterministic
          </Text.H6>
          <div className='relative min-w-32'>
            <Slider
              showMiddleRange
              disabled={disabled}
              min={0}
              max={2}
              step={0.1}
              value={[temperatureValue]}
              onValueChange={(value) => setTemperatureValue(value[0])}
            />
          </div>
          <Text.H6
            color={
              temperatureValue === 2 ? 'accentForeground' : 'foregroundMuted'
            }
          >
            Creative
          </Text.H6>
        </div>
      </ConfigElement>
    </ConfigSection>
  )
}
