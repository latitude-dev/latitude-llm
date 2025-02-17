import { SwitchToogle } from '@latitude-data/web-ui'
import { ConfigElement, ConfigSection } from './_components/ConfigSection'
import {
  PromptConfigurationProps,
  useConfigValue,
  useLatitudeToolsConfig,
} from './utils'
import { LatitudeTool } from '@latitude-data/core/browser'

export function BehaviourSettings({
  config,
  setConfig,
  disabled,
}: PromptConfigurationProps) {
  const { value: agentValue, setValue: setAgentValue } = useConfigValue<
    'agent' | undefined
  >({
    config,
    setConfig,
    key: 'type',
    defaultValue: undefined,
  })

  const { tools, toggleTool } = useLatitudeToolsConfig({ config, setConfig })

  return (
    <ConfigSection title='Behaviour'>
      <ConfigElement
        label='Agent type'
        icon='bot'
        summary='Allow the prompt to use agentic behavior.'
        description={`Agents allow prompts to run autonomously, handling multiple steps until a task is completed.
Unlike regular prompts or predefined Chains, Agents can adapt dynamically, responding to user input and tool outputs in real time to achieve the desired result.`}
      >
        <SwitchToogle
          disabled={disabled}
          checked={agentValue === 'agent'}
          onCheckedChange={() =>
            setAgentValue(agentValue === 'agent' ? undefined : 'agent')
          }
        />
      </ConfigElement>
      <ConfigElement
        label='Run code'
        icon='terminal'
        summary='Enables the AI to run code to help generate the response.'
        description={`Allows the model to execute their own generated scripts to solve problems or answer questions.
          A new tool will be injected into the prompt, and handled in Latitide's backend when the AI requests it.`}
      >
        <SwitchToogle
          disabled={disabled}
          checked={tools.includes(LatitudeTool.RunCode)}
          onCheckedChange={() => toggleTool(LatitudeTool.RunCode)}
        />
      </ConfigElement>
      <ConfigElement
        label='Web search'
        icon='search'
        summary='Enables the AI to search the web to help generate the response.'
        description={`Allows the model to search the web for information to get real-time data.
          A new tool will be injected into the prompt, and handled in Latitide's backend when the AI requests it.`}
      >
        <SwitchToogle
          disabled={disabled}
          checked={tools.includes(LatitudeTool.WebSearch)}
          onCheckedChange={() => toggleTool(LatitudeTool.WebSearch)}
        />
      </ConfigElement>
      <ConfigElement
        label='Extract web content'
        icon='globe'
        summary='Enables the AI to read the contents from web pages.'
        description={`Allows the model to extract content from web pages as Markdown.
          A new tool will be injected into the prompt, and handled in Latitide's backend when the AI requests it.`}
      >
        <SwitchToogle
          disabled={disabled}
          checked={tools.includes(LatitudeTool.WebExtract)}
          onCheckedChange={() => toggleTool(LatitudeTool.WebExtract)}
        />
      </ConfigElement>
    </ConfigSection>
  )
}
