import { Input } from '@latitude-data/web-ui/atoms/Input'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import { type PromptConfigurationProps, useConfigValue } from './utils'
import {
  ABSOLUTE_MAX_STEPS,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_CONFIG_NAME,
} from '@latitude-data/constants'

export function LimitSettings({ config, setConfig, disabled }: PromptConfigurationProps) {
  const { value: maxSteps, setValue: setMaxSteps } = useConfigValue<number>({
    config,
    setConfig,
    key: MAX_STEPS_CONFIG_NAME,
    defaultValue: DEFAULT_MAX_STEPS,
  })
  const { value: maxTokens, setValue: setMaxTokens } = useConfigValue<number>({
    config,
    setConfig,
    key: 'maxTokens',
    defaultValue: 0,
  })

  return (
    <ConfigSection title='Limits'>
      <ConfigElement
        label='Max steps'
        icon='listVideo'
        summary={`The maximum number of steps the ${config.type === 'agent' ? 'agent' : 'chain'} can execute.`}
        description={`The maximum number of steps that can be executed upon running the prompt.
          If the prompt reaches the maximum number of steps, it will stop executing and return an error.
          This is useful to prevent infinite loops or to limit the amount of work the AI can do.`}
      >
        <div className='w-24'>
          <Input
            disabled={disabled}
            type='number'
            value={maxSteps}
            min={1}
            max={ABSOLUTE_MAX_STEPS}
            onChange={(e) =>
              setMaxSteps(
                e.target.value === ''
                  ? undefined
                  : Math.min(ABSOLUTE_MAX_STEPS, Math.max(1, parseInt(e.target.value, 10))),
              )
            }
          />
        </div>
      </ConfigElement>
      <ConfigElement
        label='Max tokens per step'
        icon='wholeWord'
        summary='The maximum number of tokens the AI can use per step. Set to 0 for no limit.'
        description={`The maximum number of tokens the AI can use per step.
          Useful to limit the AI response length, or to prevent the AI from using too many tokens in a single step.`}
      >
        <div className='w-24'>
          <Input
            disabled={disabled}
            type='number'
            value={maxTokens}
            min={0}
            onChange={(e) => {
              const newValue = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
              setMaxTokens(newValue ? newValue : undefined)
            }}
          />
        </div>
      </ConfigElement>
    </ConfigSection>
  )
}
