import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Container } from '../../Container'

export function DisplayPrompt({ prompt }: { prompt: string }) {
  return (
    <Container>
      <CodeBlock
        className='rounded-md overflow-hidden border border-border'
        language='markdown'
      >
        {prompt}
      </CodeBlock>
    </Container>
  )
}
