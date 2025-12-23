import {
  FrameworkDefinition,
  UnsupportedFrameworkDefinition,
} from '../frameworks'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { InstallationStep } from './InstallationStep'
import { withIndent } from './utils'

function initializeCodeblock(framework: FrameworkDefinition): string {
  if ('autoInstrumentation' in framework) {
    return `
import { LatitudeTelemetry } from '@latitude-data/telemetry'
${framework.autoInstrumentation.import}

export const telemetry = new LatitudeTelemetry(
  process.env.LATITUDE_API_KEY,
  {
  instrumentations: {
    ${framework.autoInstrumentation.line}
  },
)`.trim()
  }

  return `
import { LatitudeTelemetry } from '@latitude-data/telemetry'

export const telemetry = new LatitudeTelemetry(
  process.env.LATITUDE_API_KEY,
)`.trim()
}

function implementationCodeblock(framework: FrameworkDefinition): string {
  if ('autoInstrumentation' in framework) {
    return `
import { telemetry } from './telemetry'
${framework.implementation.import}

export async function generateSupportReply(input: string) {
  return telemetry.capture(
    {
      projectId: process.env.LATITUDE_PROJECT_ID,
      path: 'generate-support-reply', // Add a path to identify this prompt in Latitude
    },
    async () => {
      // Your regular LLM-powered feature code here
${withIndent(framework.implementation.codeblock, 3)}

      // You can return anything you want — the value is passed through unchanged
      return ${framework.implementation.return}
    }
  )
}`.trim()
  }

  return `
import { telemetry } from './telemetry'
import { generateAIResponse } from './generateAIResponse'

export async function generateSupportReply(input: string) {
  return telemetry.capture(
    {
      projectId: process.env.LATITUDE_PROJECT_ID,
      path: 'generate-support-reply', // Add a path to identify this prompt in Latitude
    },
    async () => {
      // Your AI generation code here
      const response = await generateAIResponse(...);

      // You can return anything you want — the value is passed through unchanged
      return response;
    }
  )
}`.trim()
}

function ManualInstrumentationStep({
  framework,
}: {
  framework: UnsupportedFrameworkDefinition
}) {
  return (
    <InstallationStep
      title='Instrument your AI calls'
      description={`Inside your generation function, create a completion span before calling ${framework.name}. Then, end it after the response is returned.`}
    >
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
    </InstallationStep>
  )
}

export function InstallationSteps({
  framework,
  workspaceApiKey,
  projectId,
}: {
  framework: FrameworkDefinition
  workspaceApiKey?: string
  projectId: number
}) {
  return (
    <>
      <InstallationStep title='Install Latitude Telemetry using your package manager'>
        <CodeBlock language='bash'>
          {`
npm install @latitude-data/telemetry
# or
yarn add @latitude-data/telemetry
# or
pnpm add @latitude-data/telemetry
            `.trim()}
        </CodeBlock>
      </InstallationStep>

      <InstallationStep
        title='Add environment variables'
        description='Add your environment variables to your .env file and to your container environment if you are using one. You can find your Workspace API Key and Project ID in your Workspace and Project settings respectively.'
      >
        <CodeBlock language='bash'>
          {`
LATITUDE_API_KEY=${workspaceApiKey ?? '00000000-0000-0000-0000-000000000000'}
LATITUDE_PROJECT_ID=${projectId}
            `.trim()}
        </CodeBlock>
      </InstallationStep>

      <InstallationStep
        title='Initialize Latitude Telemetry'
        description='Create a single LatitudeTelemetry instance when your app starts.'
      >
        <>
          <CodeBlock language='ts' textWrap={false}>
            {initializeCodeblock(framework)}
          </CodeBlock>
          <Alert description='The telemetry instance should only be created once, and imported everywhere you need to use it.' />
        </>
      </InstallationStep>

      <InstallationStep
        title='Wrap your AI call'
        description='Wrap the code that generates the AI response using telemetry.capture. You must add a path to identify this prompt in your Latitude project.'
      >
        <>
          <CodeBlock language='ts' textWrap={false}>
            {implementationCodeblock(framework)}
          </CodeBlock>
          <Alert description='The path is used to identify the prompt in your Latitude project. It must not contain spaces or special characters (use letters, numbers, - _ / .), and it will automatically create a new prompt in your Latitude project if it does not exist.' />
        </>
      </InstallationStep>

      {'manualInstrumentation' in framework && (
        <ManualInstrumentationStep framework={framework} />
      )}
    </>
  )
}
