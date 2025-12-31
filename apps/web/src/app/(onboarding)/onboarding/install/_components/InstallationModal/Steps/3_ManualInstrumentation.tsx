import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { InstallationStep } from './InstallationStep'
import {
  FrameworkDefinition,
  UnsupportedFrameworkDefinition,
} from '../../../frameworks'
import { withIndent } from './utils'

function CompletionSpanInstrumentation({
  framework,
}: {
  framework: UnsupportedFrameworkDefinition
}) {
  return (
    <InstallationStep
      title='Instrument your AI calls'
      description={`Inside your generation function, create a completion span before calling ${framework.name}. Then, end it after the response is returned.`}
    >
      <>
        <CodeBlock language='ts' textWrap={false}>
          {`
import { telemetry } from './telemetry'
${framework.manualInstrumentation.completion.imports.join('\n')}

export async function generateAIResponse(input: string) {
  const model = '${framework.manualInstrumentation.completion.model}'

  // 1) Start the completion span
  const span = telemetry.span.completion({
    model,
    input: [{ role: 'user', content: input }]
  })

  try {
    // 2) Call ${framework.name} as usual
${withIndent(framework.manualInstrumentation.completion.codeblock, 2)}

    // 3) End the span (attach output + useful metadata)
    span.end({
      output: [{ role: 'assistant', content: response }],
    })

    ${framework.manualInstrumentation.completion.return}
  } catch (error) {

    // Make sure to close the span even on errors
    span.fail(error)
    throw error
  }
}
`.trim()}
        </CodeBlock>
      </>
    </InstallationStep>
  )
}

export default function ManualInstrumentationSteps({
  framework,
}: {
  framework: FrameworkDefinition
}) {
  if ('autoInstrumentation' in framework) return null
  return <CompletionSpanInstrumentation framework={framework} />
}
