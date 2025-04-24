import { CodeToolArgs } from '@latitude-data/core/services/latitudeTools/runCode/types'
import { ContentCard } from '../ContentCard'
import { CodeBlock } from '../../../../atoms/CodeBlock'
import { ToolContent } from '@latitude-data/compiler'
import { ToolResultContent, ToolResultFooter } from '../ToolResult'
import { useMemo } from 'react'

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
  toolResponse,
}: {
  toolCallId: string
  args: CodeToolArgs
  toolResponse?: ToolContent
}) {
  const value = runCodeContent(args as CodeToolArgs)

  return (
    <ContentCard
      label={args.language.at(0)!.toUpperCase() + args.language.slice(1)}
      icon='code'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
      separatorColor={
        toolResponse?.isError ? 'destructiveMutedForeground' : undefined
      }
      resultFooter={
        <ToolResultFooter loadingMessage='Running code...'>
          {toolResponse && <ToolResultContent toolResponse={toolResponse} />}
        </ToolResultFooter>
      }
    >
      <CodeBlock language={args.language}>
        {useMemo(() => value, [value])}
      </CodeBlock>
    </ContentCard>
  )
}
