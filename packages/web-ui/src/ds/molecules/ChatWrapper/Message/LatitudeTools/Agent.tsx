import { ToolRequestContent } from '@latitude-data/constants'
import { CardTextContent, ContentCard } from '../ContentCard'
import { CodeBlock } from '../../../../atoms/CodeBlock'
import { useMemo } from 'react'

export function AgentToolCallContent({ value }: { value: ToolRequestContent }) {
  const isDefaultSchema =
    Object.keys(value.args).length === 1 &&
    Object.keys(value.args)[0] === 'response'

  const content = useMemo(() => {
    if (isDefaultSchema) {
      return (
        <CardTextContent
          value={value.args['response'] as string}
          color='primary'
        />
      )
    }
    return (
      <CodeBlock language='json'>
        {JSON.stringify(value.args, null, 2)}
      </CodeBlock>
    )
  }, [value.args, isDefaultSchema])

  return (
    <ContentCard
      label='Agent response'
      icon='bot'
      bgColor='bg-primary'
      fgColor='accent'
    >
      {content}
    </ContentCard>
  )
}
