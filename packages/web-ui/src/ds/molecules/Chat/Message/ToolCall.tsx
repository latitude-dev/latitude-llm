import { ToolRequestContent } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  LatitudeToolInternalName,
} from '@latitude-data/core/browser'
import { CodeBlock } from '../../../atoms'
import { CardTextContent, ContentCard } from './ContentCard'
import { CodeToolArgs } from '@latitude-data/core/services/builtInTools/runCode/types'
import { ToolCallContent as PromptlToolCall } from 'promptl-ai'

function toolArgs(
  value: ToolRequestContent | PromptlToolCall,
): Record<string, unknown> {
  if ('args' in value) return value.args
  if ('toolArguments' in value) return value.toolArguments
  return {}
}

function runCodeContent(args: CodeToolArgs): string {
  if (!args.dependencies) return args.code
  const comment = args.language === 'python' ? '#' : '//'
  const deps = ['Dependencies:']
    .concat(args.dependencies.map((dep) => `- ${dep}`))
    .map((line) => `${comment} ${line}`)
    .join('\n')
  return `${deps}\n\n${args.code}`
}

export function ToolCallContent({ value }: { value: ToolRequestContent }) {
  if (value.toolName === AGENT_RETURN_TOOL_NAME) {
    return <AgentToolCallContent value={value} />
  }

  const args = toolArgs(value)

  if (value.toolName === LatitudeToolInternalName.RunCode) {
    const { language } = args as CodeToolArgs
    return (
      <ContentCard
        label={language.at(0)!.toUpperCase() + language.slice(1)}
        icon='code'
        bgColor='bg-success'
        fgColor='successForeground'
        info={value.toolCallId}
      >
        <CodeBlock language={language}>
          {runCodeContent(args as CodeToolArgs)}
        </CodeBlock>
      </ContentCard>
    )
  }

  return (
    <ContentCard
      label='Tool requested'
      icon='puzzle'
      bgColor='bg-yellow'
      fgColor='warningForeground'
      info={value.toolCallId}
      infoColor='warningMutedForeground'
    >
      <CodeBlock language='javascript'>
        {`${value.toolName}(${JSON.stringify(args, null, 2)})`}
      </CodeBlock>
    </ContentCard>
  )
}

export function AgentToolCallContent({ value }: { value: ToolRequestContent }) {
  const isDefaultSchema =
    Object.keys(value.args).length === 1 &&
    Object.keys(value.args)[0] === 'response'
  return (
    <ContentCard
      label='Agent response'
      icon='bot'
      bgColor='bg-primary'
      fgColor='accent'
    >
      {isDefaultSchema ? (
        <CardTextContent
          value={value.args['response'] as string}
          color='primary'
        />
      ) : (
        <CodeBlock language='json'>
          {JSON.stringify(value.args, null, 2)}
        </CodeBlock>
      )}
    </ContentCard>
  )
}
