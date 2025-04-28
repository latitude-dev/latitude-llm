import { useCallback } from 'react'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import { PromptConfigurationProps, useConfigValue } from './utils'
import { SubAgentSelector } from './_components/AgentSelector'

export function BehaviourSettings({
  config,
  setConfig,
  disabled,
  canUseSubagents,
}: PromptConfigurationProps) {
  const agentValue = (config['type'] ?? undefined) as 'agent' | undefined
  const {
    value: disabledAgentOptimization,
    setValue: setDisableAgentOptimization,
  } = useConfigValue<boolean>({
    config,
    setConfig,
    key: 'disableAgentOptimization',
    defaultValue: false,
  })

  const setValues = useCallback(
    (updates: Partial<PromptConfigurationProps['config']>) => {
      setConfig({ ...config, ...updates })
    },
    [config, setConfig],
  )

  const onAgentCheckedChange = useCallback(
    (checked: boolean) => {
      const newAgentValue = checked ? 'agent' : undefined

      const updates: Partial<typeof config> = { type: newAgentValue }
      if (newAgentValue !== 'agent') {
        updates.disableAgentOptimization = undefined
      }

      setValues(updates)
    },
    [setValues],
  )

  return (
    <ConfigSection title='Behaviour'>
      <ConfigElement
        label='Agent type'
        icon='bot'
        summary='Allow the prompt to use agentic behavior.'
        description={`Agents allow prompts to run autonomously, handling multiple steps until a task is completed.
Unlike regular prompts or predefined Chains, Agents can adapt dynamically, responding to user input and tool outputs in real time to achieve the desired result.`}
      >
        <SwitchToggle
          disabled={disabled}
          checked={agentValue === 'agent'}
          onCheckedChange={onAgentCheckedChange}
        />
      </ConfigElement>
      {agentValue === 'agent' && (
        <div className='w-full pl-6'>
          <ConfigElement
            label='Advanced agent optimization'
            icon='sparkles'
            summary='Automatically optimizes the agent behaviour without needing to add additional prompting.'
            description={`When enabled, the agent will automatically know that they are in an autonomous workflow and how it works.
                Otherwise, you will need to add custom prompting to avoid the AI falling into infinite loops and using the agent tools correctly.
                This optimization is done without adding or modifying any SYSTEM or USER message from your prompt, it's all handled internally by Latitude.`}
          >
            <SwitchToggle
              disabled={disabled}
              checked={!disabledAgentOptimization}
              onCheckedChange={() =>
                setDisableAgentOptimization(
                  disabledAgentOptimization ? undefined : true,
                )
              }
            />
          </ConfigElement>
        </div>
      )}
      {canUseSubagents ? (
        <ConfigElement
          label='Subagents'
          icon='bot'
          summary='Allow the AI to delegate some tasks to other agents to help generate the response.'
          description={`Allows the model to call other agents to help generate the response.
          New tools will be injected into the prompt, one per selected agent, that will execute the selected agent's prompt and return the result to the main prompt.`}
        >
          <SubAgentSelector
            config={config}
            setConfig={setConfig}
            disabled={disabled}
            canUseSubagents={canUseSubagents}
          />
        </ConfigElement>
      ) : null}
    </ConfigSection>
  )
}
