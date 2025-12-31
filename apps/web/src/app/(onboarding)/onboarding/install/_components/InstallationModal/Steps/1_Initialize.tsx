import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { InstallationStep } from './InstallationStep'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FrameworkDefinition } from '../../../frameworks'

function codeblockContent(framework: FrameworkDefinition): string {
  if ('autoInstrumentation' in framework) {
    // Supported framework
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

  // Unsupported framework
  return `
import { LatitudeTelemetry } from '@latitude-data/telemetry'

export const telemetry = new LatitudeTelemetry(
  process.env.LATITUDE_API_KEY,
)`.trim()
}

export default function InitializeStep({
  framework,
}: {
  framework: FrameworkDefinition
}) {
  return (
    <InstallationStep
      title='Initialize Latitude Telemetry'
      description='Create a single LatitudeTelemetry instance when your app starts.'
    >
      <>
        <CodeBlock language='ts' textWrap={false}>
          {codeblockContent(framework)}
        </CodeBlock>
        <Alert description='The telemetry instance should only be created once, and imported everywhere you need to use it.' />
      </>
    </InstallationStep>
  )
}
