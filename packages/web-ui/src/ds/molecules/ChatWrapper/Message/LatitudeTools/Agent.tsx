import { ToolRequestContent } from '@latitude-data/compiler'
import { CardTextContent, ContentCard } from '../ContentCard'
import { CodeBlock } from '../../../../atoms/CodeBlock'

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
