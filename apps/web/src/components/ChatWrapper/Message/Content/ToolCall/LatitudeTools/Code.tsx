import { CodeToolArgs } from '@latitude-data/core/services/latitudeTools/runCode/types'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo, useState } from 'react'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import {
  ToolCardContentWrapper,
  ToolCardOutput,
} from '../_components/ToolCard/Content'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

const isExpectedOutput = (toolResponse: ToolContent | undefined) => {
  // Returns false if the tool response does not contain the expected output
  if (!toolResponse) return false
  if (toolResponse.isError) return false

  if (typeof toolResponse.result !== 'string') return false
  return true
}

function RunCodeOutput({
  toolResponse,
  simulated,
}: {
  toolResponse: ToolContent | undefined
  simulated?: boolean
}) {
  const isExpectedResponse = useMemo(
    () => isExpectedOutput(toolResponse),
    [toolResponse],
  )

  if (!toolResponse) {
    return (
      <ToolCardContentWrapper>
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='loader' color='foregroundMuted' spin />
          <Text.H5 color='foregroundMuted'>Running code...</Text.H5>
        </div>
      </ToolCardContentWrapper>
    )
  }

  if (!isExpectedResponse) {
    return <ToolCardOutput toolResponse={toolResponse} simulated={simulated} />
  }

  return (
    <ToolCardContentWrapper>
      <CodeBlock language='shell'>{toolResponse.result as string}</CodeBlock>
    </ToolCardContentWrapper>
  )
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

export function RunCodeLatitudeToolCard({
  toolRequest,
  toolResponse,
  status,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as CodeToolArgs
  const value = useMemo(() => runCodeContent(args), [args])

  return (
    <ToolCardWrapper>
      <ToolCardHeader
        icon={<ToolCardIcon status={status} name='code' />}
        label={<ToolCardText color='foregroundMuted'>Run Code</ToolCardText>}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && (
        <>
          <ToolCardContentWrapper>
            <CodeBlock language={args.language}>{value}</CodeBlock>
          </ToolCardContentWrapper>
          <RunCodeOutput
            toolResponse={toolResponse}
            simulated={toolRequest._sourceData?.simulated}
          />
        </>
      )}
    </ToolCardWrapper>
  )
}
