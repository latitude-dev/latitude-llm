import {
  Button,
  Icon,
  Input,
  Popover,
  Text,
  TruncatedTooltip,
} from '@latitude-data/web-ui'
import { PromptConfigurationProps, useLatitudeAgentsConfig } from '../utils'
import { useMemo, useState } from 'react'

export function AgentSelector({
  config,
  setConfig,
  disabled,
}: PromptConfigurationProps) {
  const { selectedAgents, availableAgents, toggleAgent } =
    useLatitudeAgentsConfig({ config, setConfig })

  const [filter, setFilter] = useState<string>('')
  const filteredList = useMemo(
    () => availableAgents.filter((agent) => agent.includes(filter)),
    [availableAgents, filter],
  )

  const label = useMemo(() => {
    if (!selectedAgents.length) return 'No agents selected'
    if (selectedAgents.length === 1) return selectedAgents[0]
    return `${selectedAgents.length} agents selected`
  }, [selectedAgents])

  return (
    <Popover.Root onOpenChange={() => setFilter('')}>
      <Popover.Trigger asChild>
        <Button
          variant='outline'
          className='w-[200px] justify-start overflow-hidden'
          disabled={disabled}
        >
          <Text.H5 color='foregroundMuted' noWrap ellipsis>
            {label}
          </Text.H5>
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <div className='flex flex-col gap-2'>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder='Search'
          />
          <div className='flex flex-col gap-1 max-h-[300px] overflow-y-auto custom-scrollbar'>
            {filteredList.map((agent) => {
              const isSelected = selectedAgents.includes(agent)
              return (
                <Button
                  key={agent}
                  variant='ghost'
                  onClick={() => toggleAgent(agent)}
                  className='px-2 relative max-w-full overflow-hidden hover:bg-muted'
                  fullWidth
                >
                  <div className='flex flex-row gap-2 w-full justify-start max-w-full'>
                    <div className='min-w-4 flex items-center'>
                      {isSelected && (
                        <Icon name='checkClean' color='accentForeground' />
                      )}
                    </div>
                    <TruncatedTooltip content={agent}>
                      <Text.H6
                        noWrap
                        ellipsis
                        color={isSelected ? 'accentForeground' : 'foreground'}
                      >
                        {agent}
                      </Text.H6>
                    </TruncatedTooltip>
                  </div>
                </Button>
              )
            })}
            {filteredList.length === 0 && (
              <Text.H5 color='foregroundMuted'>No agents found</Text.H5>
            )}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
