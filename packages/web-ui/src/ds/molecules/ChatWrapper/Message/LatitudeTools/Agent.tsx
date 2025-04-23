import { ToolRequestContent } from '@latitude-data/compiler'
import { CardTextContent, ContentCard } from '../ContentCard'
import { CodeBlock } from '../../../../atoms/CodeBlock'
import { useMemo } from 'react'

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
      {useMemo(
        () =>
          isDefaultSchema ? (
            <CardTextContent
              value={value.args['response'] as string}
              color='primary'
            />
          ) : (
            <CodeBlock language='json'>
              {useMemo(() => JSON.stringify(value.args, null, 2), [value.args])}
            </CodeBlock>
          ),
        [value.args],
      )}
    </ContentCard>
  )
}
