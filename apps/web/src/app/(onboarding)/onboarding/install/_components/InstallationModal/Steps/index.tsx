import { FrameworkDefinition } from '../../../frameworks'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { InstallationStep } from './InstallationStep'

import InitializeStep from './1_Initialize'
import ImplementationStep from './2_Implementation'
import ManualInstrumentationSteps from './3_ManualInstrumentation'

export function InstallationSteps({
  framework,
  workspaceApiKey,
  projectId,
}: {
  framework: FrameworkDefinition
  workspaceApiKey: string
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

      <InitializeStep framework={framework} />
      <ImplementationStep framework={framework} />
      <ManualInstrumentationSteps framework={framework} />
    </>
  )
}
