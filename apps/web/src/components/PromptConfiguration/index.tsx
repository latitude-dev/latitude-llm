import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { useState } from 'react'
import { GenerationSettings } from './GenerationSettings'
import { ReasoningSettings } from './ReasoningSettings'
import { BehaviourSettings } from './BehaviourSettings'
import { PromptConfigurationProps, useReactiveConfig } from './utils'
import { LimitSettings } from './LimitSettings'

export function PromptConfiguration({
  disabled,
  fancyButton = false,
  showBehaviorSettings = true,
  ...restProps
}: PromptConfigurationProps) {
  const canUseSubagents = restProps.canUseSubagents
  const [isOpen, setIsOpen] = useState(false)
  const { config, setConfig } = useReactiveConfig({
    config: restProps.config,
    setConfig: restProps.setConfig,
  })

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          fancy={fancyButton}
          variant='outline'
          size='iconDefault'
          disabled={disabled}
          childrenOnlyText
          iconProps={{ name: 'settings' }}
          onClick={() => setIsOpen(true)}
        />
      </Popover.Trigger>

      <Popover.Content
        side='right'
        align='start'
        sideOffset={8}
        alignOffset={-16}
        maxHeight='none'
        width={600}
        onOpenAutoFocus={(event) => {
          event.preventDefault() // fixes https://github.com/radix-ui/primitives/issues/2248
        }}
      >
        <div className='flex flex-col gap-6 p-2'>
          <GenerationSettings
            config={config}
            canUseSubagents={canUseSubagents}
            setConfig={setConfig}
            disabled={disabled}
          />
          <ReasoningSettings
            config={config}
            canUseSubagents={canUseSubagents}
            setConfig={setConfig}
            disabled={disabled}
          />
          {showBehaviorSettings ? (
            <BehaviourSettings
              config={config}
              canUseSubagents={canUseSubagents}
              setConfig={setConfig}
              disabled={disabled}
            />
          ) : null}
          <LimitSettings
            config={config}
            canUseSubagents={canUseSubagents}
            setConfig={setConfig}
            disabled={disabled}
          />
          <a
            target='_blank'
            href='https://docs.latitude.so/guides/prompt-manager/configuration#configuration-options'
          >
            <Button variant='link' className='p-0'>
              More configuration
            </Button>
          </a>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
