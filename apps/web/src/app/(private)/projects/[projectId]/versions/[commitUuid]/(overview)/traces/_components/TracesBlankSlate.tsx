import { Project } from '@latitude-data/core/browser'
import { CodeBlock, Text } from '@latitude-data/web-ui'
import { DocumentBlankSlateLayout } from '../../../(commit)/documents/_components/DocumentBlankSlateLayout'

export function TracesBlankSlate({
  apiKey,
  project,
}: {
  apiKey: string | undefined
  project: Project
}) {
  return (
    <DocumentBlankSlateLayout className='p-6'>
      <div className='flex flex-col gap-4 items-center'>
        <Text.H4M>Getting started</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          There are no traces for this project yet. To start follow this step:
        </Text.H5>
      </div>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <Text.H4M>Instrument your application with Latitude</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Add this code snippet to start streaming traces to Latitude. Once
          done, come back to this page, and you'll be able to evaluate both
          existing and incoming traces.
        </Text.H5>
        <TracesJavascriptUsage apiKey={apiKey} project={project} />
      </div>
    </DocumentBlankSlateLayout>
  )
}

export function TracesJavascriptUsage({
  apiKey,
  project,
}: {
  apiKey: string | undefined
  project: Project
}) {
  const sdkCode = `import { Latitude } from "@latitude-data/sdk";

// Latitude's API Key is a secret, do not expose it in client-side code
const latitude = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { 
  projectId: ${project.id},
  telemetry: {
    modules: {
      openAI: OpenAI, // Check the documentation to get a list of supported modules
    }
  }
})
`

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}
