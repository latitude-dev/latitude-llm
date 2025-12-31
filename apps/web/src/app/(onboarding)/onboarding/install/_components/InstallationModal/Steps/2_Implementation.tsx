import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { InstallationStep } from './InstallationStep'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FrameworkDefinition } from '../../../frameworks'
import { withIndent } from './utils'

const codeblockContent = (framework: FrameworkDefinition): string => {
  if ('autoInstrumentation' in framework) {
    // Supported framework
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

  // Unsupported framework
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

export default function ImplementationStep({
  framework,
}: {
  framework: FrameworkDefinition
}) {
  return (
    <InstallationStep
      title='Wrap your AI call'
      description={`Wrap the code that generates the AI response using telemetry.capture. You must add a path to identify this prompt in your Latitude project.`}
    >
      <>
        <CodeBlock language='ts' textWrap={false}>
          {codeblockContent(framework)}
        </CodeBlock>
        <Alert description='The path is used to identify the prompt in your Latitude project. It must not contain spaces or special characters (use letters, numbers, - _ / .), and it will automatically create a new prompt in your Latitude project if it does not exist.' />
      </>
    </InstallationStep>
  )
}
