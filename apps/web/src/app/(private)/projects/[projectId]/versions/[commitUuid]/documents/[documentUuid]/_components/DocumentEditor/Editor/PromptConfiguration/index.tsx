import { Button, Icon, Popover } from '@latitude-data/web-ui'
import { useState } from 'react'
import { GenerationSettings } from './GenerationSettings'
import { BehaviourSettings } from './BehaviourSettings'
import { PromptConfigurationProps, useReactiveConfig } from './utils'
import Link from 'next/link'
import { LimitSettings } from './LimitSettings'

export function PromptConfiguration({
  disabled,
  ...restProps
}: PromptConfigurationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { config, setConfig } = useReactiveConfig(restProps)

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button variant='outline' onClick={() => setIsOpen(true)}>
          <Icon name='settings' size='normal' className='my-0.5' />
        </Button>
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
            setConfig={setConfig}
            disabled={disabled}
          />
          <BehaviourSettings
            config={config}
            setConfig={setConfig}
            disabled={disabled}
          />
          <LimitSettings
            config={config}
            setConfig={setConfig}
            disabled={disabled}
          />
          <Link href='https://docs.latitude.so/guides/prompt-manager/configuration#configuration-options'>
            <Button variant='link' className='p-0'>
              More configuration
            </Button>
          </Link>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
