import { CodeToolArgs } from '@latitude-data/core/services/latitudeTools/runCode/types'
import { ContentCard } from '../ContentCard'
import { CodeBlock } from '../../../../atoms'

function runCodeContent(args: CodeToolArgs): string {
  if (!args.dependencies) return args.code
  const comment = args.language === 'python' ? '#' : '//'
  const deps = ['Dependencies:']
    .concat(args.dependencies.map((dep) => `- ${dep}`))
    .map((line) => `${comment} ${line}`)
    .join('\n')
  return `${deps}\n\n${args.code}`
}

export function CodeLatitudeToolCallContent({
  toolCallId,
  args,
}: {
  toolCallId: string
  args: CodeToolArgs
}) {
  return (
    <ContentCard
      label={args.language.at(0)!.toUpperCase() + args.language.slice(1)}
      icon='code'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <CodeBlock language={args.language}>
        {runCodeContent(args as CodeToolArgs)}
      </CodeBlock>
    </ContentCard>
  )
}
