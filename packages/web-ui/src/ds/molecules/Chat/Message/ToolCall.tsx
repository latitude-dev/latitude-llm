import { ToolRequestContent } from '@latitude-data/compiler'
import {
  AGENT_RETURN_TOOL_NAME,
  LatitudeBuiltInToolName,
} from '@latitude-data/core/browser'
import { CodeBlock } from '../../../atoms'
import { ContentCard } from './ContentCard'
import { CodeToolArgs } from '@latitude-data/core/services/builtInTools/runCode/types'

export function ToolCallContent({ value }: { value: ToolRequestContent }) {
  if (value.toolName === AGENT_RETURN_TOOL_NAME) {
    return (
      <ContentCard
        label='Agent Response'
        icon='bot'
        bgColor='bg-primary'
        fgColor='accent'
        info={value.toolCallId}
      >
        <CodeBlock language='json'>
          {JSON.stringify(value.args, null, 2)}
        </CodeBlock>
      </ContentCard>
    )
  }

  if (value.toolName === LatitudeBuiltInToolName.RunCode) {
    const args = value.args as CodeToolArgs
    return (
      <ContentCard
        label={args.language.at(0)!.toUpperCase() + args.language.slice(1)}
        icon='code'
        bgColor='bg-success'
        fgColor='successForeground'
        info={value.toolCallId}
      >
        <CodeBlock language={args.language}>{args.code}</CodeBlock>
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
        {`${value.toolName}(${JSON.stringify(value.args, null, 2)})`}
      </CodeBlock>
    </ContentCard>
  )
}
