import {
  LATITUDE_TOOLS_CONFIG_NAME,
  LatitudeTool,
} from '@latitude-data/core/browser'
import { Checkbox, cn, Icon, Text, Tooltip } from '@latitude-data/web-ui'
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from 'react'

function Config({
  title,
  description,
  direction = 'column',
  children,
}: {
  title: string
  description?: string
  direction?: 'column' | 'row'
  children: ReactNode
}) {
  return (
    <div
      className={cn('w-full flex', {
        'flex-row gap-4': direction === 'row',
        'flex-col gap-1': direction === 'column',
      })}
    >
      <div className='flex flex-row items-center gap-2 min-w-fit'>
        <Text.H5B>{title}</Text.H5B>
        {description && (
          <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
            {description}
          </Tooltip>
        )}
      </div>
      <div className='w-full px-2'>{children}</div>
    </div>
  )
}

function SliderConfig({
  value: _value,
  minLabel,
  maxLabel,
  onChange,
}: {
  minLabel?: string
  maxLabel?: string
  value: number
  onChange: (value: number) => void
}) {
  const [value, setValue] = useState<number>(_value)
  useEffect(() => setValue(_value), [_value])

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    setValue(newValue)
    onChange(newValue)
  }

  return (
    <div className='w-full flex gap-2 items-center'>
      {minLabel && <Text.H6>{minLabel}</Text.H6>}
      <input
        type='range'
        value={value}
        onInput={handleInput}
        className='w-full'
        min={0}
        max={2}
        step={0.1}
      />
      {maxLabel && <Text.H6>{maxLabel}</Text.H6>}
    </div>
  )
}

function BooleanConfig({
  label,
  description,
  value: _value,
  onChange,
}: {
  label?: string
  description?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  const [value, setValue] = useState<boolean>(_value)
  useEffect(() => setValue(_value), [_value])

  const handleInput = () => {
    const newValue = !value
    setValue(newValue)
    onChange(newValue)
  }

  return (
    <div className='w-full flex gap-2 items-center'>
      <Checkbox checked={value} onClick={handleInput} fullWidth={false} />
      {label && <Text.H5>{label}</Text.H5>}
      {description && (
        <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
          {description}
        </Tooltip>
      )}
    </div>
  )
}

export function PromptConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>
  updateConfig: (config: Record<string, unknown>) => void
}) {
  const toolsArray = useMemo<LatitudeTool[]>(() => {
    return (config?.[LATITUDE_TOOLS_CONFIG_NAME] as LatitudeTool[]) ?? []
  }, [config])

  const toggleLatitudeTool = (tool: LatitudeTool) => {
    const hasTool = toolsArray.includes(tool)
    const newToolsArray = hasTool
      ? toolsArray.filter((t) => t !== tool)
      : [...toolsArray, tool]

    updateConfig({
      [LATITUDE_TOOLS_CONFIG_NAME]: newToolsArray.length
        ? newToolsArray
        : undefined,
    })
  }

  return (
    <div className='w-full flex flex-col gap-4'>
      <Config
        title='Temperature'
        description='Temperature controls the randomness of an LLM’s responses. Lower values (e.g., 0.1) make outputs more predictable and focused, while higher values (e.g., 1.0) increase diversity and creativity. A temperature of 0 makes responses nearly deterministic, while higher values introduce more variation by considering less probable words.'
      >
        <SliderConfig
          minLabel='Deterministic'
          maxLabel='Creative'
          value={(config.temperature as number) ?? 1}
          onChange={(value) => updateConfig({ temperature: value })}
        />
      </Config>
      <Config
        title='Agentic behavior'
        description='Agents allow prompts to run autonomously, handling multiple steps until a task is completed. Unlike regular prompts or predefined Chains, Agents can adapt dynamically, responding to user input and tool outputs in real time to achieve the desired result.'
        direction='row'
      >
        <BooleanConfig
          value={config.type === 'agent'}
          onChange={(value) =>
            updateConfig({ type: value ? 'agent' : undefined })
          }
        />
      </Config>
      <Config
        title='Latitude Tools'
        description='Latitude Tools are Built-In tools that the AI can use to help generate the response.'
      >
        <div className='flex flex-col gap-2'>
          <BooleanConfig
            label='Run Code'
            description='Allow the AI to run code to help generate the response.'
            value={toolsArray.includes(LatitudeTool.RunCode)}
            onChange={() => toggleLatitudeTool(LatitudeTool.RunCode)}
          />
          <BooleanConfig
            label='Web Search'
            description='Allow the AI to search the web to help generate the response.'
            value={toolsArray.includes(LatitudeTool.WebSearch)}
            onChange={() => toggleLatitudeTool(LatitudeTool.WebSearch)}
          />
          <BooleanConfig
            label='Extract Web Content'
            description='Allow the AI to extract content from the web to help generate the response.'
            value={false}
            onChange={() => {}}
          />
        </div>
      </Config>
    </div>
  )
}
