import { useCallback } from 'react'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import { PromptConfigurationProps } from './utils'
import { SubAgentSelector } from './_components/AgentSelector'

export function BehaviourSettings({
  config,
  setConfig,
  disabled,
  canUseSubagents,
}: PromptConfigurationProps) {
  const agentValue = (config['type'] ?? undefined) as 'agent' | undefined
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
